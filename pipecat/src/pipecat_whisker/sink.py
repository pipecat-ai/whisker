#
# Copyright (c) 2024-2026, Daily
#
# SPDX-License-Identifier: BSD 2-Clause License
#

"""WhiskerSink: abstract base for whisker debugger backends.

A sink is a :class:`~pipecat.pipeline.base_worker.BaseWorker` that owns
the per-worker observer registry, captures bus messages, and tracks
worker lifecycle status. Each event the sink produces (frame /
``worker_added`` / ``worker_status`` / ``bus_message``) is handed to
the abstract :meth:`emit` method, which subclasses implement to
deliver the event to their target — a file, a websocket client, a
network stream, an HTTP webhook, etc.

The base does **not** choose a wire encoding. ``emit`` receives the
event as a plain ``dict``; each sink picks its own serialization
(msgpack, JSON, protobuf, ...).

Typical wiring through ``PIPECAT_SETUP_FILES``::

    from pipecat_whisker import WhiskerFile

    sink = WhiskerFile("session.bin")

    async def setup_pipeline_runner(runner):
        await runner.add_workers(sink)

    async def setup_pipeline_worker(worker):
        worker.add_observer(sink.create_observer(worker))
"""

import asyncio
import platform
import sys
import time
from abc import abstractmethod
from collections import deque
from dataclasses import dataclass, field, fields, is_dataclass
from importlib.metadata import version
from typing import (
    TYPE_CHECKING,
    Any,
    Callable,
    Deque,
    Dict,
    List,
    Optional,
    Set,
    Tuple,
    Type,
)

from loguru import logger
from pipecat.bus.messages import (
    BusActivateWorkerMessage,
    BusAddWorkerMessage,
    BusCancelMessage,
    BusCancelWorkerMessage,
    BusDeactivateWorkerMessage,
    BusEndMessage,
    BusEndWorkerMessage,
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
    BusWorkerErrorMessage,
    BusWorkerLocalErrorMessage,
    BusWorkerReadyMessage,
    BusWorkerRegistryMessage,
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
from pipecat.pipeline.base_worker import BaseWorker
from pipecat.pipeline.worker import PipelineWorker
from pipecat.processors.aggregators.llm_context import LLMContext
from pipecat.processors.frame_processor import FrameProcessor
from pydantic import BaseModel

from pipecat_whisker.frames import WhiskerFrame, WhiskerUrgentFrame

if TYPE_CHECKING:
    from pipecat_whisker.observer import WhiskerObserver

__PIPECAT_VERSION__ = version("pipecat-ai")
__WHISKER_VERSION__ = version("pipecat-ai-whisker")
__PYTHON_VERSION__ = sys.version


PROTOCOL_VERSION = "1"

DEFAULT_EXCLUDE_FRAMES: Tuple[Type[Frame], ...] = (
    InputAudioRawFrame,
    OutputAudioRawFrame,
    UserSpeakingFrame,
    BotSpeakingFrame,
)

# Frame types that are too chatty to forward as bus messages. These are
# applied only to BusFrameMessage; non-frame bus messages always flow.
DEFAULT_EXCLUDE_BUS_FRAMES: Tuple[Type[Frame], ...] = (
    InputAudioRawFrame,
    OutputAudioRawFrame,
    UserSpeakingFrame,
    BotSpeakingFrame,
)

BUS_MESSAGE_BUFFER_SIZE = 200

_LIFECYCLE_BUS_MESSAGES: Tuple[type, ...] = (
    BusActivateWorkerMessage,
    BusDeactivateWorkerMessage,
    BusEndWorkerMessage,
    BusCancelWorkerMessage,
    BusWorkerReadyMessage,
    BusWorkerRegistryMessage,
    BusAddWorkerMessage,
    BusWorkerErrorMessage,
    BusWorkerLocalErrorMessage,
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
    """Default frame serializer used by sinks.

    Args:
        frame: The frame to serialize.

    Returns:
        A JSON-shaped representation of the frame.
    """
    try:
        return whisker_obj_serializer(frame)
    except Exception as e:
        logger.warning(f"ᓚᘏᗢ Whisker: unable to serialize {frame}: {e}")
        return "<unable to serialize, check server logs>"


WhiskerSerializer = Callable[[Frame], Any]


@dataclass
class _ObservedWorker:
    """Per-worker state tracked by :class:`WhiskerSink`."""

    worker_name: str
    pipeline: BasePipeline
    parent: Optional[str] = None
    added_at: float = field(default_factory=time.time)
    status: Optional[str] = None
    # Filled in opportunistically when a ``BusWorkerReadyMessage`` for this
    # worker arrives on the bus.
    runner: Optional[str] = None
    started_at: Optional[float] = None
    bridged: Optional[bool] = None
    active: Optional[bool] = None


# Maps a lifecycle :class:`BusMessage` type to the wire ``worker_status``
# value and the attribute that names the worker the event refers to.
_WORKER_STATUS_BY_MESSAGE: Tuple[Tuple[type, str, str], ...] = (
    (BusWorkerReadyMessage, "ready", "source"),
    (BusActivateWorkerMessage, "active", "target"),
    (BusDeactivateWorkerMessage, "inactive", "target"),
    (BusEndWorkerMessage, "ended", "target"),
    (BusCancelWorkerMessage, "cancelled", "target"),
    (BusWorkerErrorMessage, "errored", "source"),
    (BusWorkerLocalErrorMessage, "errored", "source"),
)


def _worker_status_from_message(
    message: BusMessage,
) -> Optional[Tuple[str, str]]:
    """Return ``(worker_name, status)`` for lifecycle messages, else ``None``."""
    for cls, status, attr in _WORKER_STATUS_BY_MESSAGE:
        if isinstance(message, cls):
            name = getattr(message, attr, None)
            if isinstance(name, str):
                return name, status
            return None
    return None


class WhiskerSink(BaseWorker):
    """Abstract base for whisker debugger backends.

    Owns the per-worker observer registry, bus message ring buffer, and
    worker lifecycle capture. Subclasses implement :meth:`emit` to
    deliver each recorded event to their target.

    Subclasses can:

    - Override :meth:`emit` to handle every event (required).
    - Override :meth:`start` / :meth:`stop` to manage their own
      resources (always call ``super``).
    - Call :meth:`build_snapshot` to obtain the current state as a
      single ``snapshot`` event — useful when initializing a new
      consumer (file header, websocket client connect, etc.).
    """

    def __init__(
        self,
        name: str = "whisker-sink",
        *,
        serializer: Optional[WhiskerSerializer] = None,
        exclude_bus_frames: Tuple[Type[Frame], ...] = DEFAULT_EXCLUDE_BUS_FRAMES,
        bus_message_buffer_size: int = BUS_MESSAGE_BUFFER_SIZE,
    ):
        """Initialize the sink.

        Args:
            name: Worker name registered with the runner.
            serializer: Optional frame serializer override.
            exclude_bus_frames: Frame types to skip when reporting
                ``BusFrameMessage``s — applied only to the frame inside
                the bus message, not to non-frame bus messages.
            bus_message_buffer_size: Maximum number of recent bus
                messages to retain in the in-memory ring buffer.
        """
        super().__init__(name=name)
        self._serializer: WhiskerSerializer = serializer or whisker_serializer
        self._exclude_bus_frames = exclude_bus_frames

        # Registered observers, keyed by worker name.
        self._observed: Dict[str, _ObservedWorker] = {}

        # Ring buffer of recent bus messages; subclasses can read it (for
        # example to replay state to a freshly-connected websocket
        # client).
        self._bus_messages: Deque[dict] = deque(maxlen=bus_message_buffer_size)

        # Monotonic frame counter included in every frame event so
        # downstream consumers can dedupe / order.
        self._frame_seq = 0

        # True once :meth:`start` has been called. Gates ``emit`` calls
        # so workers registered before the sink is wired up don't fire
        # events into a sink that isn't ready yet.
        self._sink_started = False

        # Pending fire-and-forget ``worker_added`` emits kicked off by
        # :meth:`create_observer` — tracked so :meth:`stop` can cancel
        # any still in flight.
        self._pending_emit_tasks: Set[asyncio.Task] = set()

    # ---- Extension point ---------------------------------------------------

    @abstractmethod
    async def emit(self, event: dict) -> None:
        """Deliver a single event to the backend.

        Implementations are responsible for any wire encoding. The
        ``event`` dict carries its own ``"timestamp"`` and ``"type"``
        fields; valid types are ``snapshot``, ``worker_added``,
        ``worker_status``, ``worker_removed``, ``bus_message``, and any
        of ``frame`` / ``frame:whisker`` / ``frame:whisker-urgent``.

        Args:
            event: The wire dict to deliver.
        """

    # ---- Observer factory --------------------------------------------------

    def create_observer(
        self,
        worker: PipelineWorker,
        *,
        exclude_frames: Tuple[Type[Frame], ...] = DEFAULT_EXCLUDE_FRAMES,
    ) -> "WhiskerObserver":
        """Return a per-worker observer that forwards frames to this sink.

        Args:
            worker: The pipeline worker to observe.
            exclude_frames: Frame types to skip (audio/speaking frames
                are excluded by default to avoid swamping consumers).

        Returns:
            A :class:`WhiskerObserver` already wired to this sink.
        """
        # Local import avoids a circular import between sink and observer.
        from pipecat_whisker.observer import WhiskerObserver

        if worker.name in self._observed:
            logger.warning(f"ᓚᘏᗢ Whisker: worker '{worker.name}' already observed; replacing entry")
        entry = _ObservedWorker(
            worker_name=worker.name,
            pipeline=worker.pipeline,
            parent=worker.parent,
        )
        self._observed[worker.name] = entry

        # Once the sink has started, emit a ``worker_added`` event so
        # live consumers can see the registration. Before start, the
        # worker simply sits in ``_observed`` and shows up in the next
        # ``snapshot`` event.
        if self._sink_started:
            task = self.create_task(self._emit_worker_added(entry))
            self._pending_emit_tasks.add(task)
            task.add_done_callback(self._pending_emit_tasks.discard)

        return WhiskerObserver(worker=worker, sink=self, exclude_frames=exclude_frames)

    # ---- BaseWorker lifecycle ---------------------------------------------

    async def start(self) -> None:
        """Mark the sink active. Subclasses should call ``super().start()``."""
        await super().start()
        self._sink_started = True

    async def stop(self) -> None:
        """Mark the sink inactive. Subclasses should call ``super().stop()``."""
        self._sink_started = False
        # Cancel any in-flight ``worker_added`` emits before tearing
        # down the worker — they'd otherwise try to emit into a sink
        # whose subclass is already shutting down.
        for task in list(self._pending_emit_tasks):
            await self.cancel_task(task)
        self._pending_emit_tasks.clear()
        await super().stop()

    # ---- Observer-facing API ----------------------------------------------

    async def on_frame_pushed(self, worker_name: str, data: FramePushed) -> None:
        """Forward a pushed frame from a per-worker observer."""
        await self._emit_frame(
            worker_name=worker_name,
            action="push",
            processor=data.source,
            direction=data.direction,
            frame=data.frame,
        )

    async def on_frame_processed(self, worker_name: str, data: FrameProcessed) -> None:
        """Forward a processed frame from a per-worker observer."""
        await self._emit_frame(
            worker_name=worker_name,
            action="process",
            processor=data.processor,
            direction=data.direction,
            frame=data.frame,
        )

    # ---- Bus capture -------------------------------------------------------

    async def on_bus_message(self, message: BusMessage) -> None:
        """Capture every bus message, buffer it, and emit it.

        Overrides :meth:`BaseWorker.on_bus_message` to see *all* messages —
        the base implementation early-returns for ``BusFrameMessage`` and
        for messages targeted at other workers, which would hide cross-worker
        traffic that is interesting to debug.
        """
        if isinstance(message, BusFrameMessage) and isinstance(
            message.frame, self._exclude_bus_frames
        ):
            await super().on_bus_message(message)
            return

        event = self._build_bus_message_event(message)
        self._bus_messages.append(event)
        await self.emit(event)

        await self._maybe_emit_worker_status(message)
        await super().on_bus_message(message)

    # ---- Snapshot / event builders ----------------------------------------

    def build_snapshot(self) -> dict:
        """Return the current state as a ``snapshot`` event dict.

        Subclasses call this to anchor a fresh consumer with the
        protocol version, runtime versions, and currently-registered
        workers — for example a file backend writes it on open, a
        websocket backend sends it on client connect.

        Returns:
            A ``snapshot`` event dict ready for :meth:`emit` or direct
            send.
        """
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
            "workers": [self._worker_descriptor(e) for e in self._observed.values()],
        }

    def _build_bus_message_event(self, message: BusMessage) -> dict:
        # Walk the message via the generic serializer; strip source/target so
        # they aren't duplicated alongside the top-level fields.
        payload = whisker_obj_serializer(message)
        if isinstance(payload, dict):
            payload.pop("source", None)
            payload.pop("target", None)
        return {
            "type": "bus_message",
            "timestamp": time.time(),
            "message_type": type(message).__name__,
            "category": _categorize_bus_message(message),
            "source_worker": getattr(message, "source", None),
            "target_worker": getattr(message, "target", None),
            "data": payload,
        }

    def _build_topology(self, entry: _ObservedWorker) -> dict:
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

    def _worker_descriptor(self, entry: _ObservedWorker) -> dict:
        descriptor: dict = {
            "worker_id": entry.worker_name,
            "added_at": entry.added_at,
            "topology": self._build_topology(entry),
        }
        if entry.parent is not None:
            descriptor["parent"] = entry.parent
        if entry.status is not None:
            descriptor["status"] = entry.status
        if entry.runner is not None:
            descriptor["runner"] = entry.runner
        if entry.started_at is not None:
            descriptor["started_at"] = entry.started_at
        if entry.bridged is not None:
            descriptor["bridged"] = entry.bridged
        if entry.active is not None:
            descriptor["active"] = entry.active
        return descriptor

    # ---- Event emitters ---------------------------------------------------

    async def _emit_worker_added(self, entry: _ObservedWorker) -> None:
        ts = time.time()
        msg = {
            "type": "worker_added",
            "timestamp": ts,
            **self._worker_descriptor(entry),
        }
        await self.emit(msg)

    async def _emit_worker_status(self, worker_name: str, status: str) -> None:
        ts = time.time()
        msg: dict = {
            "type": "worker_status",
            "timestamp": ts,
            "worker_id": worker_name,
            "status": status,
        }
        entry = self._observed.get(worker_name)
        if entry is not None:
            # Ride-along metadata captured from BusWorkerReadyMessage.
            if entry.runner is not None:
                msg["runner"] = entry.runner
            if entry.started_at is not None:
                msg["started_at"] = entry.started_at
            if entry.bridged is not None:
                msg["bridged"] = entry.bridged
            if entry.active is not None:
                msg["active"] = entry.active
        await self.emit(msg)

    def _frame_type(self, frame: Frame) -> str:
        if isinstance(frame, WhiskerFrame):
            return "frame:whisker"
        elif isinstance(frame, WhiskerUrgentFrame):
            return "frame:whisker-urgent"
        return "frame"

    async def _emit_frame(
        self,
        *,
        worker_name: str,
        action: str,
        processor: FrameProcessor,
        direction,
        frame: Frame,
    ) -> None:
        self._frame_seq += 1
        ts = time.time()
        msg = {
            "type": self._frame_type(frame),
            "id": self._frame_seq,
            "worker_id": worker_name,
            "name": frame.name,
            "from": processor.name,
            "action": action,
            "direction": direction.name.lower(),
            "timestamp": ts,
            "payload": self._serializer(frame),
        }
        await self.emit(msg)

    async def _maybe_emit_worker_status(self, message: BusMessage) -> None:
        """Translate a lifecycle bus message into a ``worker_status`` event."""
        if not self._sink_started:
            return
        result = _worker_status_from_message(message)
        if result is None:
            return
        worker_name, status = result
        entry = self._observed.get(worker_name)
        if entry is None:
            return

        metadata_changed = False
        if isinstance(message, BusWorkerReadyMessage):
            for attr in ("runner", "started_at", "bridged", "active"):
                value = getattr(message, attr, None)
                if value is not None and getattr(entry, attr) != value:
                    setattr(entry, attr, value)
                    metadata_changed = True

        if entry.status == status and not metadata_changed:
            return
        entry.status = status
        await self._emit_worker_status(worker_name, status)
