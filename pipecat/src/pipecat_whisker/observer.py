#
# Copyright (c) 2024-2026, Daily
#
# SPDX-License-Identifier: BSD 2-Clause License
#

"""Per-worker observer that forwards frames to a :class:`WhiskerSink`.

The observer is intentionally tiny: it filters out frames the user does
not want to see and hands every other frame off to the shared sink,
which owns the wire delivery. Construct one via
:meth:`WhiskerSink.create_observer` rather than calling this class
directly.
"""

from typing import Tuple, Type

from pipecat.frames.frames import Frame
from pipecat.observers.base_observer import BaseObserver, FrameProcessed, FramePushed
from pipecat.pipeline.worker import PipelineWorker

from pipecat_whisker.sink import DEFAULT_EXCLUDE_FRAMES, WhiskerSink


class WhiskerObserver(BaseObserver):
    """Lightweight observer that forwards frame events to a WhiskerSink.

    Created via :meth:`WhiskerSink.create_observer`; do not instantiate
    directly unless you are wiring the sink manually.
    """

    def __init__(
        self,
        worker: PipelineWorker,
        sink: WhiskerSink,
        *,
        exclude_frames: Tuple[Type[Frame], ...] = DEFAULT_EXCLUDE_FRAMES,
    ):
        """Initialize the observer.

        Args:
            worker: The pipeline worker whose frames will be observed.
            sink: The :class:`WhiskerSink` that owns event delivery.
            exclude_frames: Frame types to skip before forwarding.
        """
        super().__init__()
        self._worker_name = worker.name
        self._sink = sink
        self._exclude_frames = exclude_frames

    async def on_process_frame(self, data: FrameProcessed) -> None:
        """Forward a processed frame to the sink."""
        if not isinstance(data.frame, self._exclude_frames):
            await self._sink.on_frame_processed(self._worker_name, data)

    async def on_push_frame(self, data: FramePushed) -> None:
        """Forward a pushed frame to the sink."""
        if not isinstance(data.frame, self._exclude_frames):
            await self._sink.on_frame_pushed(self._worker_name, data)
