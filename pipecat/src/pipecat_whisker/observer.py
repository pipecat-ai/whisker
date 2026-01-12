#
# Copyright (c) 2024–2026, Daily
#
# SPDX-License-Identifier: BSD 2-Clause License
#

"""Whisker is a live graphical debugger for the Pipecat.

This module provides a Pipecat observer that you can easily pass to your
Pipeline task observers.

The Whisker observer will wait for a client connection (only one connection
allowed at a time) and will send the Pipeline graph and the frames that go
through each processor in real-time.

With the Whisker client you can:

- View a live graph of your pipeline.
- Watch frame processors flash in real time as frames pass through them.
- Select a processor to inspect the frames it has handled (both pushed and processed).
- Select a frame to trace its full path through the pipeline.

Think of Whisker as trace logging with batteries.
"""

import asyncio
import platform
import sys
import time
from dataclasses import fields, is_dataclass
from importlib.metadata import version
from typing import Any, Callable, Dict, List, Optional, Tuple, Type

import aiofiles
import msgpack
from loguru import logger
from pipecat.frames.frames import BotSpeakingFrame, Frame, InputAudioRawFrame
from pipecat.observers.base_observer import BaseObserver, FrameProcessed, FramePushed
from pipecat.pipeline.base_pipeline import BasePipeline
from pipecat.processors.aggregators.openai_llm_context import OpenAILLMContext
from pipecat.processors.frame_processor import FrameProcessor
from pydantic import BaseModel
from websockets import ConnectionClosedOK, serve

from pipecat_whisker.frames import WhiskerFrame, WhiskerUrgentFrame

__PIPECAT_VERSION__ = version("pipecat-ai")
__WHISKER_VERSION__ = version("pipecat-ai-whisker")
__PYTHON_VERSION__ = sys.version


MAX_BATCH_SIZE_BYTES = 10000


def whisker_obj_serializer(obj: Any) -> Any:
    """Recursively serialize dataclasses to a JSON-serializable dictionary.

    Args:
        obj: The object to serialize.

    Returns:
        Any: A JSON representation of the input object.
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
    elif isinstance(obj, OpenAILLMContext):
        return obj.get_messages_for_logging()
    elif isinstance(obj, (int, float, bool, str)):
        return obj
    else:
        # If it's something we don't know about just use the type name.
        return f"<type: {type(obj).__name__}>"


def whisker_serializer(observer: BaseObserver, frame: Frame, **kwargs) -> str:
    """Serializes a frame to a JSON string.

    Args:
        observer: The observer that is calling this serializer.
        frame: The frame to serialize.
        **kwargs: Additional keyword arguments to pass to json.dumps().

    Returns:
        str: A JSON string representation of the input frame.
    """
    try:
        return whisker_obj_serializer(frame)
    except Exception as e:
        logger.warning(f"ᓚᘏᗢ {observer}: unable to serialize {frame}: {e}")
        return '"Unable to deserialize, check server logs"'


WhiskerSerializer = Callable[[BaseObserver, Frame], Any]


class WhiskerObserver(BaseObserver):
    """A websocket-based observer for monitoring and debugging pipeline operations.

    The Whisker client connects to this observer in order to provide a visual
    representation of the pipeline in real-time.
    """

    def __init__(
        self,
        pipeline: BasePipeline,
        *,
        host: str = "localhost",
        port: int = 9090,
        batch_size: int = MAX_BATCH_SIZE_BYTES,
        exclude_frames: Tuple[Type[Frame], ...] = (InputAudioRawFrame, BotSpeakingFrame),
        file_name: Optional[str] = None,
        serializer: Optional[WhiskerSerializer] = None,
    ):
        """Initialize the Whisker observer.

        Args:
            pipeline: The pipeline to observe and monitor.
            host: Host address to bind the WebSocket server to. Defaults to "localhost".
            port: Port number to bind the WebSocket server to. Defaults to 9090.
            batch_size: Maximum batch size (in bytes) to buffer before sending a message to
                the client.
            exclude_frames: Tuple of frame types to exclude from observation.
                Defaults to (InputAudioRawFrame, BotSpeakingFrame).
            file_name: Optional file path to save the debugging session for later use.
            serializer: Optiona serializer used to serialize frames for sending to the client.
        """
        super().__init__()
        self._pipeline = pipeline
        self._host = host
        self._port = port
        self._batch_size = batch_size
        self._exclude_frames = exclude_frames
        self._file_name = file_name
        self._serializer = serializer or whisker_serializer

        self._id = 0
        self._client = None
        self._server_future = asyncio.get_running_loop().create_future()
        self._server_task = asyncio.create_task(self._server_task_handler())
        self._send_task = asyncio.create_task(self._send_task_handler())
        self._send_queue = asyncio.Queue()
        self._batch = []

        # Open file
        self._file = None

    async def cleanup(self):
        """Clean up resources and close the Whisker server."""
        await super().cleanup()

        await self._stop_send_task()

        await self._close_client()

        await self._stop_server()

        await self._maybe_close_file()

    async def on_process_frame(self, data: FrameProcessed):
        """Handle frame processing events.

        Args:
            data: Frame processing event data containing the frame and processor.
        """
        if not isinstance(data.frame, self._exclude_frames):
            await self._send_process_frame(data)

    async def on_push_frame(self, data: FramePushed):
        """Handle frame push events.

        Args:
            data: Frame push event data containing the frame and source processor.
        """
        if not isinstance(data.frame, self._exclude_frames):
            await self._send_push_frame(data)

    async def _server_task_handler(self):
        """Start the Whisker server and handle incoming connections.

        This method runs in a separate task and manages the websocket server lifecycle.
        """
        # We save the session even if there's no client connected.
        await self._maybe_open_file()

        # Queue initial pipeline structure
        await self._send_pipeline()

        async with serve(self._client_handler, self._host, self._port):
            logger.debug(f"ᓚᘏᗢ Whisker running at ws://{self._host}:{self._port}")
            await self._server_future

    async def _stop_server(self):
        if not self._server_future.done():
            self._server_future.set_result(None)

        if self._server_task:
            await self._server_task

    async def _client_handler(self, client):
        """Handle a new Whisker client connection.

        Args:
            client: The websocket client connection.
        """
        if self._client:
            logger.warning("ᓚᘏᗢ Whisker: a client is already connected, only one client allowed")
            return

        logger.debug(f"ᓚᘏᗢ Whisker: client connected {client.remote_address}")

        self._client = client
        try:
            # Keep alive
            async for _ in self._client:
                pass
        except ConnectionClosedOK:
            pass
        except Exception as e:
            logger.warning(f"ᓚᘏᗢ Whisker: client closed with error: {e}")
        finally:
            logger.debug("ᓚᘏᗢ Whisker: client disconnected")
            await self._reset_client()

    async def _close_client(self):
        if self._client:
            await self._client.close(reason="Whisker shutting down")

    async def _reset_client(self):
        self._client = None

    async def _maybe_open_file(self):
        if self._file_name:
            logger.debug(f"ᓚᘏᗢ Whisker: opening file {self._file_name}")
            self._file = await aiofiles.open(self._file_name, "wb")

    async def _maybe_close_file(self):
        if self._file:
            logger.debug(f"ᓚᘏᗢ Whisker: closing file {self._file_name}")
            await self._file.close()
            self._file = None

    async def _send_task_handler(self):
        """Handle sending batched messages to the client."""
        running = True
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

    async def _stop_send_task(self):
        await self._queue_data(None, True)
        if self._send_task:
            await self._send_task

    async def _maybe_send_batch(self, *, flush: bool = False):
        """Send batched messages to the client.

        Args:
            flush: If True, force sending the current batch immediately.
        """

        def build_message(batch) -> bytes:
            return b"".join(batch)

        if not self._client or not self._batch:
            return

        index = self._compute_batch_index()
        if index == -1 and not flush:
            return

        send_index = len(self._batch) if index == -1 else index
        message = build_message(self._batch[:send_index])
        await self._send(message)
        self._batch = self._batch[send_index:]

    def _compute_batch_index(self) -> int:
        """Compute the index to split the batch based on size constraints.

        Returns:
            int: The index to split the batch at, or -1 if no split is needed.
        """
        size = 0
        for i, data in enumerate(self._batch):
            size += len(data)
            if size >= self._batch_size:
                return i
        return -1

    async def _send_pipeline(self):
        """Send the pipeline structure to the connected WebSocket client.

        The pipeline structure includes:
        - Processors: List of all processors in the pipeline
        - Connections: List of connections between processors
        """
        processors: List[Dict] = []
        connections: List[Dict] = []

        def traverse(
            curr: FrameProcessor, prev: List[FrameProcessor], parent: Optional[FrameProcessor]
        ) -> List[FrameProcessor]:
            """Recursively traverse the pipeline structure.

            Args:
                curr: Current processor being processed.
                prev: List of previous processors in the traversal.
                parent: Parent processor of the current processor.

            Returns:
                List[FrameProcessor]: List of leaf processors from this branch of the traversal.
            """
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
                new_prev = []
                for p in curr.entry_processors:
                    entry_prev = traverse(p, prev, curr)
                    new_prev.append(*entry_prev)
            else:
                new_prev = [curr]

            if curr.next:
                new_prev = traverse(curr.next, new_prev, parent)

            return new_prev

        # Internally, a pipeline is connected to a source (and sink), so we just
        # grab its first processor.
        traverse(self._pipeline.entry_processors[0], [], None)

        msg = {
            "type": "pipeline",
            "processors": processors,
            "connections": connections,
            "versions": {
                "python": __PYTHON_VERSION__,
                "pipecat": __PIPECAT_VERSION__,
                "whisker": __WHISKER_VERSION__,
                "platform": platform.platform(),
            },
        }
        msg_packed = msgpack.packb(msg)

        await self._queue_data(msg_packed)

    def _frame_type(self, frame: Frame) -> str:
        frame_type = "frame"

        if isinstance(frame, WhiskerFrame):
            frame_type = "frame:whisker"
        elif isinstance(frame, WhiskerUrgentFrame):
            frame_type = "frame:whisker-urgent"

        return frame_type

    async def _send_process_frame(self, data: FrameProcessed):
        """Send a frame processing event to the client.

        Args:
            data: The frame processing event data containing the frame and processor.
        """
        self._id += 1
        processor = data.processor
        direction = data.direction
        frame = data.frame
        frame_type = self._frame_type(frame)
        msg = {
            "type": frame_type,
            "id": self._id,
            "name": frame.name,
            "from": processor.name,
            "event": "process",
            "direction": direction.name.lower(),
            "timestamp": time.time_ns() / 1_000_000,
            "payload": self._serializer(self, frame),
        }
        msg_packed = msgpack.packb(msg)

        await self._queue_data(msg_packed)

    async def _send_push_frame(self, data: FramePushed):
        """Send a frame push event to the client.

        Args:
            data: The frame push event data containing the frame and source processor.
        """
        self._id += 1
        processor = data.source
        direction = data.direction
        frame = data.frame
        frame_type = self._frame_type(frame)
        msg = {
            "type": frame_type,
            "id": self._id,
            "name": frame.name,
            "from": processor.name,
            "event": "push",
            "direction": direction.name.lower(),
            "timestamp": time.time_ns() / 1_000_000,
            "payload": self._serializer(self, frame),
        }
        msg_packed = msgpack.packb(msg)

        await self._queue_data(msg_packed)

    async def _queue_data(self, msg: Optional[bytes], flush: bool = False):
        await self._send_queue.put((msg, flush))
        if self._file and msg:
            await self._file.write(msg)

    async def _send(self, msg: bytes):
        """Send a message to the connected client.

        Args:
            msg: The message to send as bytes
        """
        try:
            if self._client:
                await self._client.send(msg)
        except ConnectionClosedOK:
            pass
        except Exception as e:
            logger.warning(f"ᓚᘏᗢ Whisker: client closed with error: {e}")
