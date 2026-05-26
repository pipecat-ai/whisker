#
# Copyright (c) 2024-2026, Daily
#
# SPDX-License-Identifier: BSD 2-Clause License
#

"""WhiskerFile: file-only whisker sink.

Use this sink when you want to record a whisker session to disk without
running a websocket server. Opens the file on :meth:`start`, writes the
current snapshot as the first record, then appends every event the
sink produces.

Typical wiring through ``PIPECAT_SETUP_FILES``::

    from pipecat_whisker import WhiskerFile

    sink = WhiskerFile("session.bin")

    async def setup_pipeline_runner(runner):
        await runner.add_workers(sink)

    async def setup_pipeline_worker(worker):
        worker.add_observer(sink.create_observer(worker))
"""

from typing import Optional, Tuple, Type

import aiofiles
import msgpack
from loguru import logger
from pipecat.frames.frames import Frame

from pipecat_whisker.sink import (
    BUS_EVENT_BUFFER_SIZE,
    DEFAULT_EXCLUDE_BUS_FRAMES,
    WhiskerSerializer,
    WhiskerSink,
)


class WhiskerFile(WhiskerSink):
    """Append every emitted event to a file as msgpack records.

    Each record on disk is a single msgpack message — same wire format
    used by :class:`WhiskerServer` so the same recordings load in the
    Whisker UI.
    """

    def __init__(
        self,
        file_name: str,
        *,
        name: str = "whisker-file",
        serializer: Optional[WhiskerSerializer] = None,
        exclude_bus_frames: Tuple[Type[Frame], ...] = DEFAULT_EXCLUDE_BUS_FRAMES,
        bus_event_buffer_size: int = BUS_EVENT_BUFFER_SIZE,
    ):
        """Initialize the file sink.

        Args:
            file_name: Path to the recording file.
            name: Worker name registered with the runner.
            serializer: Optional frame serializer override.
            exclude_bus_frames: Frame types to skip when reporting
                ``BusFrameMessage``s.
            bus_event_buffer_size: Maximum number of recent bus events
                to retain in the in-memory ring buffer.
        """
        super().__init__(
            name=name,
            serializer=serializer,
            exclude_bus_frames=exclude_bus_frames,
            bus_event_buffer_size=bus_event_buffer_size,
        )
        self._file_name = file_name
        self._file = None

    async def start(self) -> None:
        """Open the file and write the initial snapshot."""
        await super().start()
        logger.debug(f"ᓚᘏᗢ Whisker: opening file {self._file_name}")
        self._file = await aiofiles.open(self._file_name, "wb")
        # Anchor the recording with the current snapshot so replays of
        # this file have a protocol/version header; subsequent
        # ``worker_added`` events fill in workers registered after open.
        await self._file.write(msgpack.packb(self.build_snapshot()))

    async def stop(self) -> None:
        """Close the file."""
        if self._file is not None:
            logger.debug(f"ᓚᘏᗢ Whisker: closing file {self._file_name}")
            await self._file.close()
            self._file = None
        await super().stop()

    async def emit(self, event: dict) -> None:
        """Append the event to the file.

        Capture the file handle locally and swallow ``ValueError`` /
        ``RuntimeError`` raised by writes that race with :meth:`stop` —
        observer tasks owned by other workers can still fire events at
        us while shutdown unwinds, and we'd rather drop the trailing
        bytes than crash the proxy task with "write to closed file".
        """
        f = self._file
        if f is None:
            return
        try:
            await f.write(msgpack.packb(event))
        except (ValueError, RuntimeError):
            pass
