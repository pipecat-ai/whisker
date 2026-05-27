#
# Copyright (c) 2024-2026, Daily
#
# SPDX-License-Identifier: BSD 2-Clause License
#

"""WhiskerServer: live WebSocket sink for the Whisker debugger.

The server is a :class:`~pipecat_whisker.sink.WhiskerSink` that hosts a
WebSocket endpoint and broadcasts events to a single connected client.
It can optionally also write the session to a file (pass
``file_name=...``); for a file-only recording use
:class:`~pipecat_whisker.file.WhiskerFile` instead.

Typical wiring through ``PIPECAT_SETUP_FILES``::

    from pipecat_whisker import WhiskerServer

    server = WhiskerServer()

    async def setup_pipeline_runner(runner):
        await runner.add_workers(server)

    async def setup_pipeline_worker(worker):
        worker.add_observer(server.create_observer(worker))
"""

import asyncio
import time
from typing import List, Optional, Tuple, Type

import aiofiles
import msgpack
from loguru import logger
from pipecat.frames.frames import Frame
from websockets import ConnectionClosedOK, serve

from pipecat_whisker.sink import (
    BUS_EVENT_BUFFER_SIZE,
    DEFAULT_EXCLUDE_BUS_FRAMES,
    WhiskerSerializer,
    WhiskerSink,
)

MAX_BATCH_SIZE_BYTES = 10000


class WhiskerServer(WhiskerSink):
    """WebSocket server sink for the Whisker debugger.

    Hosts the WS port, multiplexes events from every observer created
    via :meth:`create_observer`, and accumulates a per-session "batch"
    so a client that connects mid-session sees the recent history.
    Optionally also records every event to a file when ``file_name`` is
    provided.
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
            name: Worker name. Defaults to ``"whisker-server"``.
            host: Host address to bind the WebSocket server to.
            port: Port number to bind the WebSocket server to.
            batch_size: Maximum batch size (in bytes) before a send is
                flushed to the client.
            file_name: Optional path to also save the debugging session
                for later replay. Use :class:`WhiskerFile` if you only
                want file output (no WS server).
            serializer: Optional frame serializer override.
            exclude_bus_frames: Frame types to skip when reporting
                ``BusFrameMessage``s.
            bus_event_buffer_size: Maximum number of recent bus events
                to retain server-side for replay to newly connected
                clients.
        """
        super().__init__(
            name=name,
            serializer=serializer,
            exclude_bus_frames=exclude_bus_frames,
            bus_event_buffer_size=bus_event_buffer_size,
        )
        self._host = host
        self._port = port
        self._batch_size = batch_size
        self._file_name = file_name

        # Asyncio state — allocated lazily in start().
        self._client = None
        # Each batch entry is (timestamp_seconds, encoded_message_bytes).
        # The timestamp drives the merged replay sent to a newly
        # connected client; for steady-state sends it is unused.
        self._batch: List[Tuple[float, bytes]] = []
        self._send_queue: Optional[asyncio.Queue] = None
        self._send_task_handle: Optional[asyncio.Task] = None
        self._server_task_handle: Optional[asyncio.Task] = None
        self._file = None

    # ---- WhiskerSink hook --------------------------------------------------

    async def emit(self, event: dict) -> None:
        """Encode the event, persist it (if recording), and broadcast.

        Frames are always queued — the batch is the replay buffer for a
        future client. ``worker_added`` / ``worker_status`` /
        ``bus_event`` are only queued while a client is currently
        connected; new clients pick them up from the snapshot and the
        bus-events ring buffer at connect time.
        """
        encoded = msgpack.packb(event)
        await self._write_to_file(encoded)
        event_type = event.get("type", "")
        # Frames always go into the live batch (it doubles as the
        # disconnect→reconnect replay). Everything else only enqueues
        # when a client is currently connected.
        if event_type.startswith("frame"):
            await self._queue_data(event["timestamp"], encoded)
        elif self._client is not None:
            await self._queue_data(event["timestamp"], encoded)

    async def _write_to_file(self, data: bytes) -> None:
        """Append ``data`` to the recording file, tolerant of shutdown races.

        Capture the handle locally so a concurrent ``stop()`` can clear
        ``self._file`` without us reading a half-torn-down attribute. If
        the file ends up closed between the check and the write (other
        workers' observer tasks can still emit while we're shutting
        down), swallow the error rather than letting it bubble up
        through the observer proxy task.
        """
        f = self._file
        if f is None:
            return
        try:
            await f.write(data)
        except (ValueError, RuntimeError):
            pass

    # ---- BaseWorker lifecycle ---------------------------------------------

    async def start(self) -> None:
        """Start the WebSocket server and the send / file tasks."""
        await super().start()
        self._send_queue = asyncio.Queue()
        self._send_task_handle = self.create_task(self._send_task_handler())
        self._server_task_handle = self.create_task(self._server_task_handler())
        if self._file_name:
            logger.debug(f"ᓚᘏᗢ Whisker: opening file {self._file_name}")
            self._file = await aiofiles.open(self._file_name, "wb")
            # Anchor the recording with the current snapshot.
            await self._file.write(msgpack.packb(self.build_snapshot()))

    async def stop(self) -> None:
        """Stop sending, close the client, shut the server down."""
        if self._send_task_handle is not None:
            await self.cancel_task(self._send_task_handle)
            self._send_task_handle = None
        await self._close_client()
        if self._server_task_handle is not None:
            await self.cancel_task(self._server_task_handle)
            self._server_task_handle = None
        if self._file is not None:
            logger.debug(f"ᓚᘏᗢ Whisker: closing file {self._file_name}")
            await self._file.close()
            self._file = None
        await super().stop()

    # ---- WS server lifecycle ----------------------------------------------

    async def _server_task_handler(self) -> None:
        """Run the WebSocket server until the task is cancelled."""
        # ``ping_interval=None`` disables websockets' keepalive ping. The
        # default 20s/20s window is too tight for a debugger whose UI is
        # often a background browser tab — the tab gets throttled, misses
        # a pong, and the server tears the connection down with 1011.
        # We don't need keepalive for a localhost dev tool: a truly dead
        # client will surface on the next ``client.send``.
        async with serve(self._client_handler, self._host, self._port, ping_interval=None):
            logger.debug(f"ᓚᘏᗢ Whisker running at ws://{self._host}:{self._port}")
            # Wait forever; ``cancel_task`` propagates a CancelledError
            # that exits the ``async with`` and closes the server.
            await asyncio.Event().wait()

    async def _client_handler(self, client) -> None:
        if self._client:
            logger.warning("ᓚᘏᗢ Whisker: a client is already connected, only one client allowed")
            return

        logger.debug(f"ᓚᘏᗢ Whisker: client connected {client.remote_address}")
        try:
            # Send the snapshot first so the UI has the worker list and
            # topology before any historical or live events arrive.
            await client.send(msgpack.packb(self.build_snapshot()))

            # Drain accumulated frames + the bus event ring buffer,
            # merged by timestamp, so the UI timeline renders coherently
            # from first paint. After this point we hand the client over
            # to the live send loop.
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

    # ---- Send pipeline ----------------------------------------------------

    async def _send_task_handler(self) -> None:
        """Drain the send queue into batched ``client.send`` calls.

        Exits cleanly when the task is cancelled via :meth:`cancel_task`.
        """
        assert self._send_queue is not None
        while True:
            try:
                ts, data, flush = await asyncio.wait_for(self._send_queue.get(), timeout=0.5)
                if data is not None:
                    self._batch.append((ts if ts is not None else time.time(), data))
                await self._maybe_send_batch(flush=flush)
                self._send_queue.task_done()
            except asyncio.TimeoutError:
                await self._maybe_send_batch(flush=True)

    async def _maybe_send_batch(self, *, flush: bool = False) -> None:
        if not self._client or not self._batch:
            return

        send_count = self._compute_send_count()
        if send_count == 0 and not flush:
            return
        if send_count == 0:
            send_count = len(self._batch)

        message = b"".join(data for _, data in self._batch[:send_count])
        if not message:
            return
        await self._send(message)
        self._batch = self._batch[send_count:]

    def _compute_send_count(self) -> int:
        """Number of leading batch items to ship together.

        Returns the count whose cumulative encoded size first reaches
        ``self._batch_size`` (inclusive of the item that crossed the
        threshold), or 0 if the batch is still under the limit.
        """
        size = 0
        for i, (_, data) in enumerate(self._batch):
            size += len(data)
            if size >= self._batch_size:
                return i + 1
        return 0

    async def _queue_data(
        self,
        timestamp: Optional[float],
        msg: Optional[bytes],
        flush: bool = False,
    ) -> None:
        assert self._send_queue is not None
        await self._send_queue.put((timestamp, msg, flush))

    async def _send(self, msg: bytes) -> None:
        try:
            if self._client:
                await self._client.send(msg)
        except ConnectionClosedOK:
            pass
        except Exception as e:
            logger.warning(f"ᓚᘏᗢ Whisker: client closed with error: {e}")
