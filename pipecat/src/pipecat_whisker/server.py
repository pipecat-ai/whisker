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
from dataclasses import dataclass, field, fields, is_dataclass
from importlib.metadata import version
from typing import TYPE_CHECKING, Any, Callable, Dict, List, Optional, Tuple, Type

import aiofiles
import msgpack
from loguru import logger
from pipecat.frames.frames import BotSpeakingFrame, Frame, InputAudioRawFrame
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


MAX_BATCH_SIZE_BYTES = 10000

DEFAULT_EXCLUDE_FRAMES: Tuple[Type[Frame], ...] = (InputAudioRawFrame, BotSpeakingFrame)


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
    topology_sent: bool = field(default=False)


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
        """
        super().__init__(name=name)
        self._host = host
        self._port = port
        self._batch_size = batch_size
        self._file_name = file_name
        self._serializer: WhiskerSerializer = serializer or whisker_serializer

        # Registered observers, keyed by task name.
        self._observed: Dict[str, _ObservedTask] = {}

        # Asyncio state — allocated lazily in start().
        self._id = 0
        self._client = None
        self._batch: List[bytes] = []
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
        self._observed[task.name] = _ObservedTask(task_name=task.name, pipeline=task.pipeline)

        # If the WS server is already up, push topology for this task right away.
        if self._send_queue is not None:
            asyncio.create_task(self._send_pipeline(self._observed[task.name]))

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

    # ---- WS server lifecycle ------------------------------------------------

    async def _server_task_handler(self) -> None:
        """Run the WebSocket server until ``_server_future`` is set."""
        # Send the topology we already know about. New observers will
        # trigger their own send via create_observer().
        for entry in self._observed.values():
            await self._send_pipeline(entry)

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
        self._client = client
        try:
            # Resend topology for every observed task so a reconnecting client
            # picks up the current pipelines before live frames flow.
            for entry in self._observed.values():
                await self._send_pipeline(entry)

            async for _ in self._client:
                pass
        except ConnectionClosedOK:
            pass
        except Exception as e:
            logger.warning(f"ᓚᘏᗢ Whisker: client closed with error: {e}")
        finally:
            logger.debug("ᓚᘏᗢ Whisker: client disconnected")
            self._client = None

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
                data, flush = await asyncio.wait_for(self._send_queue.get(), timeout=0.5)
                if data:
                    self._batch.append(data)
                await self._maybe_send_batch(flush=flush)
                self._send_queue.task_done()
                running = data is not None
            except asyncio.TimeoutError:
                await self._maybe_send_batch(flush=True)

    async def _stop_send_task(self) -> None:
        if self._send_queue is None:
            return
        await self._queue_data(None, True)
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
        message = b"".join(self._batch[:send_index])
        await self._send(message)
        self._batch = self._batch[send_index:]

    def _compute_batch_index(self) -> int:
        size = 0
        for i, data in enumerate(self._batch):
            size += len(data)
            if size >= self._batch_size:
                return i
        return -1

    async def _queue_data(self, msg: Optional[bytes], flush: bool = False) -> None:
        assert self._send_queue is not None
        await self._send_queue.put((msg, flush))
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

    async def _send_pipeline(self, entry: _ObservedTask) -> None:
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

        msg = {
            "type": "pipeline",
            "task_id": entry.task_name,
            "processors": processors,
            "connections": connections,
            "versions": {
                "python": __PYTHON_VERSION__,
                "pipecat": __PIPECAT_VERSION__,
                "whisker": __WHISKER_VERSION__,
                "platform": platform.platform(),
            },
        }
        entry.topology_sent = True
        await self._queue_data(msgpack.packb(msg))

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
        msg = {
            "type": self._frame_type(frame),
            "id": self._id,
            "task_id": task_name,
            "name": frame.name,
            "from": processor.name,
            "event": event,
            "direction": direction.name.lower(),
            "timestamp": time.time_ns() / 1_000_000,
            "payload": self._serializer(frame),
        }
        await self._queue_data(msgpack.packb(msg))
