#
# Copyright (c) 2024-2026, Daily
#
# SPDX-License-Identifier: BSD 2-Clause License
#

"""WhiskerServer: process-wide WebSocket server for the Whisker debugger.

The server is a :class:`~pipecat.pipeline.base_task.BaseTask` so it can be
added to a :class:`~pipecat.pipeline.runner.PipelineRunner` alongside the
application's pipeline tasks. One WhiskerServer hosts a single WebSocket
client and multiplexes frame events from every observer created via
:meth:`WhiskerServer.create_observer`.

Typical wiring through ``PIPECAT_SETUP_FILES``::

    from pipecat_whisker import WhiskerServer

    server = WhiskerServer()

    async def setup_pipeline_runner(runner):
        await runner.spawn(server)

    async def setup_pipeline_task(task):
        task.add_observer(server.create_observer(task))
"""

import asyncio
import platform
import sys
import time
from collections import deque
from dataclasses import dataclass, field, fields, is_dataclass
from importlib.metadata import version
from typing import TYPE_CHECKING, Any, Callable, Deque, Dict, List, Optional, Tuple, Type

import aiofiles
import msgpack
from loguru import logger
from pipecat.bus.messages import (
    BusActivateTaskMessage,
    BusAddTaskMessage,
    BusCancelMessage,
    BusCancelTaskMessage,
    BusDeactivateTaskMessage,
    BusEndMessage,
    BusEndTaskMessage,
    BusFrameMessage,
    BusJobCancelMessage,
    BusJobRequestMessage,
    BusJobResponseMessage,
    BusJobResponseUrgentMessage,
    BusJobStreamDataMessage,
    BusJobStreamEndMessage,
    BusJobStreamStartMessage,
    BusJobUpdateMessage,
    BusJobUpdateRequestMessage,
    BusJobUpdateUrgentMessage,
    BusMessage,
    BusTaskErrorMessage,
    BusTaskLocalErrorMessage,
    BusTaskReadyMessage,
    BusTaskRegistryMessage,
)
from pipecat.frames.frames import (
    BotSpeakingFrame,
    Frame,
    InputAudioRawFrame,
    OutputAudioRawFrame,
    UserSpeakingFrame,
)
from pipecat.observers.base_observer import FrameProcessed, FramePushed
from pipecat.pipeline.base_pipeline import BasePipeline
from pipecat.pipeline.base_task import BaseTask
from pipecat.pipeline.task import PipelineTask
from pipecat.processors.aggregators.llm_context import LLMContext
from pipecat.processors.frame_processor import FrameProcessor
from pydantic import BaseModel
from websockets import ConnectionClosedOK, serve

from pipecat_whisker.frames import WhiskerFrame, WhiskerUrgentFrame

if TYPE_CHECKING:
    from pipecat_whisker.observer import WhiskerObserver

__PIPECAT_VERSION__ = version("pipecat-ai")
__WHISKER_VERSION__ = version("pipecat-ai-whisker")
__PYTHON_VERSION__ = sys.version


PROTOCOL_VERSION = "1"

MAX_BATCH_SIZE_BYTES = 10000

DEFAULT_EXCLUDE_FRAMES: Tuple[Type[Frame], ...] = (InputAudioRawFrame, BotSpeakingFrame)

# Frame types that are too chatty to forward as bus events. These are
# applied only to BusFrameMessage; non-frame bus messages always flow.
DEFAULT_EXCLUDE_BUS_FRAMES: Tuple[Type[Frame], ...] = (
    InputAudioRawFrame,
    OutputAudioRawFrame,
    UserSpeakingFrame,
    BotSpeakingFrame,
)

BUS_EVENT_BUFFER_SIZE = 200

_LIFECYCLE_BUS_MESSAGES: Tuple[type, ...] = (
    BusActivateTaskMessage,
    BusDeactivateTaskMessage,
    BusEndTaskMessage,
    BusCancelTaskMessage,
    BusTaskReadyMessage,
    BusTaskRegistryMessage,
    BusAddTaskMessage,
    BusTaskErrorMessage,
    BusTaskLocalErrorMessage,
    BusEndMessage,
    BusCancelMessage,
)

_JOB_BUS_MESSAGES: Tuple[type, ...] = (
    BusJobRequestMessage,
    BusJobResponseMessage,
    BusJobResponseUrgentMessage,
    BusJobUpdateMessage,
    BusJobUpdateRequestMessage,
    BusJobUpdateUrgentMessage,
    BusJobCancelMessage,
    BusJobStreamStartMessage,
    BusJobStreamDataMessage,
    BusJobStreamEndMessage,
)


def _categorize_bus_message(message: BusMessage) -> str:
    if isinstance(message, BusFrameMessage):
        return "frame"
    if isinstance(message, _JOB_BUS_MESSAGES):
        return "job"
    if isinstance(message, _LIFECYCLE_BUS_MESSAGES):
        return "lifecycle"
    return "other"


def whisker_obj_serializer(obj: Any) -> Any:
    """Recursively serialize an object into a msgpack-friendly structure.

    Args:
        obj: The object to serialize.

    Returns:
        A JSON-shaped representation of the input.
    """
    if is_dataclass(obj):
        return {
            f.name: whisker_obj_serializer(getattr(obj, f.name))
            for f in fields(obj)
            if getattr(obj, f.name) is not None
        }
    elif isinstance(obj, (list, tuple, set)):
        return [whisker_obj_serializer(v) for v in obj if v is not None]
    elif isinstance(obj, dict):
        return {k: whisker_obj_serializer(v) for k, v in obj.items() if v is not None}
    elif isinstance(obj, BaseModel):
        return obj.model_dump(exclude_none=True)
    elif isinstance(obj, LLMContext):
        return [whisker_obj_serializer(m) for m in obj.get_messages(truncate_large_values=True)]
    elif isinstance(obj, (int, float, bool, str)):
        return obj
    else:
        return f"<type: {type(obj).__name__}>"


def whisker_serializer(frame: Frame) -> Any:
    """Default frame serializer used by :class:`WhiskerServer`.

    Args:
        frame: The frame to serialize.

    Returns:
        A msgpack-friendly representation of the frame.
    """
    try:
        return whisker_obj_serializer(frame)
    except Exception as e:
        logger.warning(f"ᓚᘏᗢ Whisker: unable to serialize {frame}: {e}")
        return "<unable to serialize, check server logs>"


WhiskerSerializer = Callable[[Frame], Any]


@dataclass
class _ObservedTask:
    """Per-task state tracked by :class:`WhiskerServer`."""

    task_name: str
    pipeline: BasePipeline
    added_at: float = field(default_factory=time.time)


class WhiskerServer(BaseTask):
    """WebSocket server task for the Whisker debugger.

    Holds the WS port and forwards frame events from every observer it
    creates. Designed to be registered with a runner via
    ``setup_pipeline_runner``; each observed task adds an observer via
    ``setup_pipeline_task``.
    """

    def __init__(
        self,
        name: str = "whisker-server",
        *,
        host: str = "localhost",
        port: int = 9090,
        batch_size: int = MAX_BATCH_SIZE_BYTES,
        file_name: Optional[str] = None,
        serializer: Optional[WhiskerSerializer] = None,
        exclude_bus_frames: Tuple[Type[Frame], ...] = DEFAULT_EXCLUDE_BUS_FRAMES,
        bus_event_buffer_size: int = BUS_EVENT_BUFFER_SIZE,
    ):
        """Initialize the WhiskerServer.

        Args:
            name: Task name. Defaults to ``"whisker-server"``.
            host: Host address to bind the WebSocket server to.
            port: Port number to bind the WebSocket server to.
            batch_size: Maximum batch size (in bytes) before a send is
                flushed to the client.
            file_name: Optional path to save the debugging session for
                later replay.
            serializer: Optional frame serializer override.
            exclude_bus_frames: Frame types to skip when reporting
                ``BusFrameMessage``s — applied only to the frame inside the
                bus message, not to non-frame bus messages. Defaults to the
                chatty audio/speaking frames.
            bus_event_buffer_size: Maximum number of recent bus events to
                retain server-side for replay to newly connected clients.
        """
        super().__init__(name=name)
        self._host = host
        self._port = port
        self._batch_size = batch_size
        self._file_name = file_name
        self._serializer: WhiskerSerializer = serializer or whisker_serializer
        self._exclude_bus_frames = exclude_bus_frames

        # Registered observers, keyed by task name.
        self._observed: Dict[str, _ObservedTask] = {}

        # Ring buffer of recent bus events; included in the snapshot a new
        # client receives on connect (snapshot wiring lands with the new
        # protocol).
        self._bus_events: Deque[dict] = deque(maxlen=bus_event_buffer_size)

        # Asyncio state — allocated lazily in start().
        self._id = 0
        self._client = None
        # Each batch entry is (timestamp_seconds, encoded_message_bytes).
        # The timestamp drives the merged replay sent to a newly connected
        # client; for steady-state sends it is unused.
        self._batch: List[Tuple[float, bytes]] = []
        self._send_queue: Optional[asyncio.Queue] = None
        self._send_task_handle: Optional[asyncio.Task] = None
        self._server_task_handle: Optional[asyncio.Task] = None
        self._server_future: Optional[asyncio.Future] = None
        self._file = None

    def create_observer(
        self,
        task: PipelineTask,
        *,
        exclude_frames: Tuple[Type[Frame], ...] = DEFAULT_EXCLUDE_FRAMES,
    ) -> "WhiskerObserver":
        """Return a per-task observer that forwards frames to this server.

        Args:
            task: The pipeline task to observe.
            exclude_frames: Frame types to skip (audio/speaking frames are
                excluded by default to avoid swamping the UI).

        Returns:
            A :class:`WhiskerObserver` already wired to this server.
        """
        # Local import avoids a circular import between server and observer.
        from pipecat_whisker.observer import WhiskerObserver

        if task.name in self._observed:
            logger.warning(
                f"ᓚᘏᗢ Whisker: task '{task.name}' already observed; replacing entry"
            )
        entry = _ObservedTask(task_name=task.name, pipeline=task.pipeline)
        self._observed[task.name] = entry

        # If a client is already connected, announce this task live. Otherwise
        # it will appear in the snapshot when one connects.
        if self._send_queue is not None and self._client is not None:
            asyncio.create_task(self._send_task_added(entry))

        return WhiskerObserver(task=task, server=self, exclude_frames=exclude_frames)

    async def start(self) -> None:
        """Start the WebSocket server and send/file tasks."""
        await super().start()
        self._send_queue = asyncio.Queue()
        self._send_task_handle = asyncio.create_task(self._send_task_handler())
        self._server_future = asyncio.get_running_loop().create_future()
        self._server_task_handle = asyncio.create_task(self._server_task_handler())
        await self._maybe_open_file()

    async def stop(self) -> None:
        """Stop sending, close any client, shut the server down."""
        await self._stop_send_task()
        await self._close_client()
        await self._stop_server()
        await self._maybe_close_file()
        await super().stop()

    # ---- Observer-facing API ------------------------------------------------

    async def on_frame_pushed(self, task_name: str, data: FramePushed) -> None:
        """Forward a pushed frame from a per-task observer."""
        await self._send_frame(task_name, "push", data.source, data.direction, data.frame)

    async def on_frame_processed(self, task_name: str, data: FrameProcessed) -> None:
        """Forward a processed frame from a per-task observer."""
        await self._send_frame(task_name, "process", data.processor, data.direction, data.frame)

    # ---- Bus capture --------------------------------------------------------

    async def on_bus_message(self, message: BusMessage) -> None:
        """Capture every bus message, buffer it, and stream it live.

        Overrides :meth:`BaseTask.on_bus_message` to see *all* messages —
        the base implementation early-returns for ``BusFrameMessage`` and
        for messages targeted at other tasks, which would hide cross-task
        traffic that is interesting to debug.
        """
        if isinstance(message, BusFrameMessage) and isinstance(
            message.frame, self._exclude_bus_frames
        ):
            await super().on_bus_message(message)
            return

        event = self._build_bus_event(message)
        self._bus_events.append(event)

        if self._send_queue is not None and self._client is not None:
            await self._queue_data(event["timestamp"], msgpack.packb(event))

        await super().on_bus_message(message)

    def _build_bus_event(self, message: BusMessage) -> dict:
        # Walk the message via the generic serializer; strip source/target so
        # they aren't duplicated alongside the top-level fields.
        payload = whisker_obj_serializer(message)
        if isinstance(payload, dict):
            payload.pop("source", None)
            payload.pop("target", None)
        return {
            "type": "bus_event",
            "timestamp": time.time(),
            "message_type": type(message).__name__,
            "category": _categorize_bus_message(message),
            "source_task": getattr(message, "source", None),
            "target_task": getattr(message, "target", None),
            "data": payload,
        }

    # ---- WS server lifecycle ------------------------------------------------

    async def _server_task_handler(self) -> None:
        """Run the WebSocket server until ``_server_future`` is set."""
        assert self._server_future is not None
        async with serve(self._client_handler, self._host, self._port):
            logger.debug(f"ᓚᘏᗢ Whisker running at ws://{self._host}:{self._port}")
            await self._server_future

    async def _stop_server(self) -> None:
        if self._server_future is not None and not self._server_future.done():
            self._server_future.set_result(None)
        if self._server_task_handle is not None:
            await self._server_task_handle
            self._server_task_handle = None

    async def _client_handler(self, client) -> None:
        if self._client:
            logger.warning(
                "ᓚᘏᗢ Whisker: a client is already connected, only one client allowed"
            )
            return

        logger.debug(f"ᓚᘏᗢ Whisker: client connected {client.remote_address}")
        try:
            # Send the snapshot first so the UI has the task list and topology
            # before any historical or live events arrive.
            await client.send(msgpack.packb(self._build_snapshot()))

            # Drain accumulated frames + the bus event ring buffer, merged by
            # timestamp, so the UI timeline renders coherently from first
            # paint. After this point we hand the client over to the live
            # send loop.
            backlog = self._collect_backlog()
            if backlog is not None:
                await client.send(backlog)

            self._client = client
            async for _ in client:
                pass
        except ConnectionClosedOK:
            pass
        except Exception as e:
            logger.warning(f"ᓚᘏᗢ Whisker: client closed with error: {e}")
        finally:
            logger.debug("ᓚᘏᗢ Whisker: client disconnected")
            self._client = None

    def _collect_backlog(self) -> Optional[bytes]:
        """Drain ``_batch`` and the bus event ring buffer, merged by timestamp."""
        items: List[Tuple[float, bytes]] = list(self._batch)
        self._batch = []
        for event in self._bus_events:
            items.append((event["timestamp"], msgpack.packb(event)))
        if not items:
            return None
        items.sort(key=lambda x: x[0])
        return b"".join(data for _, data in items)

    async def _close_client(self) -> None:
        if self._client:
            await self._client.close(reason="Whisker shutting down")
            self._client = None

    # ---- File session -------------------------------------------------------

    async def _maybe_open_file(self) -> None:
        if self._file_name:
            logger.debug(f"ᓚᘏᗢ Whisker: opening file {self._file_name}")
            self._file = await aiofiles.open(self._file_name, "wb")

    async def _maybe_close_file(self) -> None:
        if self._file:
            logger.debug(f"ᓚᘏᗢ Whisker: closing file {self._file_name}")
            await self._file.close()
            self._file = None

    # ---- Send pipeline ------------------------------------------------------

    async def _send_task_handler(self) -> None:
        running = True
        assert self._send_queue is not None
        while running:
            try:
                ts, data, flush = await asyncio.wait_for(
                    self._send_queue.get(), timeout=0.5
                )
                if data is not None:
                    self._batch.append((ts if ts is not None else time.time(), data))
                await self._maybe_send_batch(flush=flush)
                self._send_queue.task_done()
                running = data is not None
            except asyncio.TimeoutError:
                await self._maybe_send_batch(flush=True)

    async def _stop_send_task(self) -> None:
        if self._send_queue is None:
            return
        await self._queue_data(None, None, True)
        if self._send_task_handle is not None:
            await self._send_task_handle
            self._send_task_handle = None

    async def _maybe_send_batch(self, *, flush: bool = False) -> None:
        if not self._client or not self._batch:
            return

        index = self._compute_batch_index()
        if index == -1 and not flush:
            return

        send_index = len(self._batch) if index == -1 else index
        message = b"".join(data for _, data in self._batch[:send_index])
        await self._send(message)
        self._batch = self._batch[send_index:]

    def _compute_batch_index(self) -> int:
        size = 0
        for i, (_, data) in enumerate(self._batch):
            size += len(data)
            if size >= self._batch_size:
                return i
        return -1

    async def _queue_data(
        self,
        timestamp: Optional[float],
        msg: Optional[bytes],
        flush: bool = False,
    ) -> None:
        assert self._send_queue is not None
        await self._send_queue.put((timestamp, msg, flush))
        if self._file and msg:
            await self._file.write(msg)

    async def _send(self, msg: bytes) -> None:
        try:
            if self._client:
                await self._client.send(msg)
        except ConnectionClosedOK:
            pass
        except Exception as e:
            logger.warning(f"ᓚᘏᗢ Whisker: client closed with error: {e}")

    # ---- Wire messages ------------------------------------------------------

    def _build_topology(self, entry: _ObservedTask) -> dict:
        processors: List[Dict] = []
        connections: List[Dict] = []

        def traverse(
            curr: FrameProcessor,
            prev: List[FrameProcessor],
            parent: Optional[FrameProcessor],
        ) -> List[FrameProcessor]:
            processors.append(
                {
                    "id": curr.name,
                    "name": curr.name,
                    "parent": parent.name if parent else None,
                    "type": curr.__class__.__name__,
                }
            )

            if prev and not curr.entry_processors:
                for p in prev:
                    connections.append({"from": p.name, "to": curr.name})

            if curr.entry_processors:
                new_prev: List[FrameProcessor] = []
                for p in curr.entry_processors:
                    entry_prev = traverse(p, prev, curr)
                    new_prev.append(*entry_prev)
            else:
                new_prev = [curr]

            if curr.next:
                new_prev = traverse(curr.next, new_prev, parent)

            return new_prev

        traverse(entry.pipeline.entry_processors[0], [], None)
        return {"processors": processors, "connections": connections}

    def _task_descriptor(self, entry: _ObservedTask) -> dict:
        return {
            "task_id": entry.task_name,
            "added_at": entry.added_at,
            "topology": self._build_topology(entry),
        }

    def _build_snapshot(self) -> dict:
        return {
            "type": "snapshot",
            "protocol": PROTOCOL_VERSION,
            "timestamp": time.time(),
            "server": {
                "python": __PYTHON_VERSION__,
                "pipecat": __PIPECAT_VERSION__,
                "whisker": __WHISKER_VERSION__,
                "platform": platform.platform(),
            },
            "tasks": [self._task_descriptor(e) for e in self._observed.values()],
        }

    async def _send_task_added(self, entry: _ObservedTask) -> None:
        ts = time.time()
        msg = {
            "type": "task_added",
            "timestamp": ts,
            **self._task_descriptor(entry),
        }
        await self._queue_data(ts, msgpack.packb(msg))

    def _frame_type(self, frame: Frame) -> str:
        if isinstance(frame, WhiskerFrame):
            return "frame:whisker"
        elif isinstance(frame, WhiskerUrgentFrame):
            return "frame:whisker-urgent"
        return "frame"

    async def _send_frame(
        self,
        task_name: str,
        event: str,
        processor: FrameProcessor,
        direction,
        frame: Frame,
    ) -> None:
        self._id += 1
        ts = time.time()
        msg = {
            "type": self._frame_type(frame),
            "id": self._id,
            "task_id": task_name,
            "name": frame.name,
            "from": processor.name,
            "event": event,
            "direction": direction.name.lower(),
            "timestamp": ts,
            "payload": self._serializer(frame),
        }
        await self._queue_data(ts, msgpack.packb(msg))
