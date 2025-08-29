#
# Copyright (c) 2024–2025, Daily
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
import json
import time
from dataclasses import fields, is_dataclass
from typing import Any, Callable, Dict, List, Optional, Tuple, Type

from loguru import logger
from pipecat.frames.frames import BotSpeakingFrame, Frame, InputAudioRawFrame
from pipecat.observers.base_observer import BaseObserver, FrameProcessed, FramePushed
from pipecat.pipeline.pipeline import Pipeline
from pipecat.processors.aggregators.openai_llm_context import OpenAILLMContext
from pipecat.processors.frame_processor import FrameProcessor
from pydantic import BaseModel
from websockets import ConnectionClosedOK, WebSocketServerProtocol, serve

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
        return json.dumps(whisker_obj_serializer(frame), **kwargs)
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
        pipeline: Pipeline,
        *,
        host: str = "localhost",
        port: int = 9090,
        batch_size: int = MAX_BATCH_SIZE_BYTES,
        exclude_frames: Tuple[Type[Frame], ...] = (InputAudioRawFrame, BotSpeakingFrame),
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
                Defaults to (UserAudioRawFrame, BotSpeakingFrame).
            serializer: Serializer used to serialize frames for sending to the client.
        """
        super().__init__()
        self._pipeline = pipeline
        self._host = host
        self._port = port
        self._batch_size = batch_size
        self._exclude_frames = exclude_frames
        self._serializer = serializer or whisker_serializer

        self._id = 0
        self._client: Optional[WebSocketServerProtocol] = None
        self._server_future = asyncio.get_running_loop().create_future()
        self._server_task = asyncio.create_task(self._start_task_handler())
        self._send_task = asyncio.create_task(self._send_task_handler())
        self._send_queue = asyncio.Queue()
        self._batch = []

    async def cleanup(self):
        """Clean up resources and close the Whisker server."""
        await super().cleanup()

        if self._client:
            await self._client.close(reason="Whisker shutting down")

        if not self._server_future.done():
            self._server_future.set_result(None)

        if self._server_task:
            await self._server_task

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

    async def _start_task_handler(self):
        """Start the Whisker server and handle incoming connections.

        This method runs in a separate task and manages the websocket server lifecycle.
        """
        async with serve(self._server_handler, self._host, self._port):
            logger.debug(f"ᓚᘏᗢ Whisker running at ws://{self._host}:{self._port}")
            await self._server_future

    async def _server_handler(self, client: WebSocketServerProtocol):
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
            # Send initial pipeline structure
            await self._send_pipeline()
            # Keep alive
            async for _ in self._client:
                pass
        except ConnectionClosedOK:
            pass
        except Exception as e:
            logger.warning(f"ᓚᘏᗢ Whisker: client closed with error: {e}")
        finally:
            logger.debug("ᓚᘏᗢ Whisker: client disconnected")
            self._client = None

    async def _send_task_handler(self):
        """Handle sending batched messages to the client."""
        while True:
            try:
                data = await asyncio.wait_for(self._send_queue.get(), timeout=0.5)

                msg = json.dumps(data)
                self._batch.append(msg)

                await self._maybe_send_batch()

                self._send_queue.task_done()
            except asyncio.TimeoutError:
                await self._maybe_send_batch(flush=True)

    async def _maybe_send_batch(self, *, flush: bool = False):
        """Send batched messages to the client.

        Args:
            flush: If True, force sending the current batch immediately.
        """

        def build_message(batch):
            return "\n".join(batch)

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

        # Pipeline will be connected to a source and sink in the pipeline task.
        traverse(self._pipeline.previous, [], None)

        msg = {
            "type": "pipeline",
            "processors": processors,
            "connections": connections,
        }
        await self._send(json.dumps(msg))

    async def _send_process_frame(self, data: FrameProcessed):
        """Send a frame processing event to the client.

        Args:
            data: The frame processing event data containing the frame and processor.
        """
        self._id += 1
        processor = data.processor
        direction = data.direction
        frame = data.frame
        msg = {
            "type": "frame",
            "id": self._id,
            "name": frame.name,
            "from": processor.name,
            "event": "process",
            "direction": direction.name.lower(),
            "timestamp": time.time_ns() / 1_000_000,
            "payload": self._serializer(self, frame),
        }

        await self._send_queue.put(msg)

    async def _send_push_frame(self, data: FramePushed):
        """Send a frame push event to the client.

        Args:
            data: The frame push event data containing the frame and source processor.
        """
        self._id += 1
        processor = data.source
        direction = data.direction
        frame = data.frame
        msg = {
            "type": "frame",
            "id": self._id,
            "name": frame.name,
            "from": processor.name,
            "event": "push",
            "direction": direction.name.lower(),
            "timestamp": time.time_ns() / 1_000_000,
            "payload": self._serializer(self, frame),
        }

        await self._send_queue.put(msg)

    async def _send(self, msg: str):
        """Send a message to the connected client.

        Args:
            msg: The message to send, as a JSON string.
        """
        try:
            if self._client:
                await self._client.send(msg)
        except ConnectionClosedOK:
            pass
        except Exception as e:
            logger.warning(f"ᓚᘏᗢ Whisker: client closed with error: {e}")
