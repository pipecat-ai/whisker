#
# Copyright (c) 2024-2026, Daily
#
# SPDX-License-Identifier: BSD 2-Clause License
#

"""Per-task observer that forwards frames to a :class:`WhiskerServer`.

The observer is intentionally tiny: it filters out frames the user does not
want to see and hands every other frame off to the shared server, which owns
the WebSocket connection. Construct one via :meth:`WhiskerServer.create_observer`
rather than calling this class directly.
"""

from typing import Tuple, Type

from pipecat.frames.frames import Frame
from pipecat.observers.base_observer import BaseObserver, FrameProcessed, FramePushed
from pipecat.pipeline.task import PipelineTask

from pipecat_whisker.server import DEFAULT_EXCLUDE_FRAMES, WhiskerServer


class WhiskerObserver(BaseObserver):
    """Lightweight observer that forwards frame events to a WhiskerServer.

    Created via :meth:`WhiskerServer.create_observer`; do not instantiate
    directly unless you are wiring the server manually.
    """

    def __init__(
        self,
        task: PipelineTask,
        server: WhiskerServer,
        *,
        exclude_frames: Tuple[Type[Frame], ...] = DEFAULT_EXCLUDE_FRAMES,
    ):
        """Initialize the observer.

        Args:
            task: The pipeline task whose frames will be observed.
            server: The :class:`WhiskerServer` that owns the WS connection.
            exclude_frames: Frame types to skip before forwarding.
        """
        super().__init__()
        self._task_name = task.name
        self._server = server
        self._exclude_frames = exclude_frames

    async def on_process_frame(self, data: FrameProcessed) -> None:
        """Forward a processed frame to the server."""
        if not isinstance(data.frame, self._exclude_frames):
            await self._server.on_frame_processed(self._task_name, data)

    async def on_push_frame(self, data: FramePushed) -> None:
        """Forward a pushed frame to the server."""
        if not isinstance(data.frame, self._exclude_frames):
            await self._server.on_frame_pushed(self._task_name, data)
