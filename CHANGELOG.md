# Changelog

All notable changes to **Whisker** will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

<!-- towncrier release notes start -->

## [2.0.0] - 2026-05-29

### Added

- Added a pluggable sink architecture for Whisker debugger backends. Third
  parties plug in custom backends (HTTP webhook, message queue, network stream,
  ...) by subclassing `WhiskerSink` and implementing `async def emit(self,
  event: dict)`. The base owns the per-worker observer registry, bus capture,
  worker lifecycle tracking, snapshot building, and the abstract `emit`
  extension point — wire encoding is the subclass's choice.
    - `WhiskerSink`: the abstract base class.
    - `WhiskerFile`: a file-only sink for headless captures and CI runs. Opens
      the file on `start()`, writes the current snapshot as the first record,
      then appends every event as a msgpack record. Drop-in replacement for
      `WhiskerServer` when you don't need the live UI — no port reserved, no
      live-client logic.
  (PR [#23](https://github.com/pipecat-ai/whisker/pull/23))

- Added a jobs panel. `BusJobRequest` / `BusJobResponse` / `BusJobUpdate` /
  `BusJobCancel` / `BusJobStream*` messages are folded client-side into a
  derived `jobs` map keyed by `job_id`, surfaced as a global, worker-filterable
  list with live status (running / completed / cancelled / failed / errored)
  and a details view that ticks the job's duration until the response arrives.
  (PR [#23](https://github.com/pipecat-ai/whisker/pull/23))

- Added towncrier-based changelog management. Per-PR fragments under
  `changelog/` (`{PR}.added.md`, `{PR}.fixed.md`, ...) get rendered into
  `CHANGELOG.md` via the `generate-changelog` GitHub workflow. The repository's
  contributing notes describe the eight fragment types (`added` / `changed` /
  `deprecated` / `removed` / `fixed` / `security` / `performance` / `other`).
  (PR [#23](https://github.com/pipecat-ai/whisker/pull/23))

- Added a bus messages panel: every `BusMessage` the runner sees is captured
  and streamed to the UI. Messages can be filtered by category (lifecycle /
  frame / job / other) and by message type via a searchable dropdown. The most
  recent 200 events are also kept in a server-side ring buffer and replayed to
  a fresh client on connect.
  (PR [#23](https://github.com/pipecat-ai/whisker/pull/23))

- Added worker lifecycle status capture. `WhiskerSink` translates
  `BusActivateWorkerMessage` / `BusDeactivateWorkerMessage` /
  `BusEndWorkerMessage` / `BusCancelWorkerMessage` / `BusWorkerReadyMessage` /
  `BusWorkerErrorMessage` / `BusWorkerLocalErrorMessage` into `worker_status`
  events (`ready` / `active` / `inactive` / `ended` / `cancelled` / `errored`).
  `BusWorkerReadyMessage` also rides along the worker's `runner`, `started_at`,
  `bridged`, and `active` fields so the UI can show them in the worker details
  pane.
  (PR [#23](https://github.com/pipecat-ai/whisker/pull/23))

- Added a multi-worker UI. The left column shows a tree of workers +
  sub-workers, a global list of jobs flowing between them (with a worker
  filter), and a details pane that adapts to whatever's selected (worker /
  processor / job). The right column streams bus messages on top and a Pipeline
  | Frames | Frame-path trio on the bottom, all horizontally resizable. The
  cytoscape pipeline graph moved to a draggable, resizable, non-modal popup
  opened from the Pipeline pane header.
  (PR [#23](https://github.com/pipecat-ai/whisker/pull/23))

### Changed

- Expanded the observer's default `exclude_frames` to also drop
  `OutputAudioRawFrame` (which covers `TTSAudioRawFrame` by subclass) and
  `UserSpeakingFrame`. These dominate observer wire traffic on real voice
  pipelines — TTS streaming audio chunks plus continuous VAD frames, observed
  at every processor — and almost never carry signal you care about while
  debugging. `BotStartedSpeakingFrame` / `BotStoppedSpeakingFrame` still flow.
  Pass an explicit `exclude_frames=...` to `sink.create_observer()` to opt back
  in.
  (PR [#23](https://github.com/pipecat-ai/whisker/pull/23))

- ⚠️ Adopted Pipecat's `task` → `worker` rename throughout Whisker.
  `WhiskerServer.create_observer()` (and `WhiskerSink.create_observer()`) now
  take a `PipelineWorker`, observers receive `worker_name` instead of
  `task_name`, and the wire protocol's per-frame `task_id` field became
  `worker_id`. Setup files should define `setup_pipeline_worker(worker)` (not
  `setup_pipeline_task(task)`) and register the sink with
  `runner.add_workers(server)` (not `runner.spawn(server)`).
  (PR [#23](https://github.com/pipecat-ai/whisker/pull/23))

- ⚠️ Switched the wire protocol to a snapshot + per-worker lifecycle model. A
  new client receives a single `snapshot` event with `protocol`, runtime
  versions, and currently-registered workers, followed by live `worker_added` /
  `worker_status` / `worker_removed` / `frame` / `bus_event` deltas. Per-worker
  topology now travels inside `worker_added` (no more top-level `pipeline`
  message), and the recording file format follows the same wire encoding so
  `WhiskerFile` captures replay through the same UI as a live session.
  (PR [#23](https://github.com/pipecat-ai/whisker/pull/23))

## [1.0.0] - 2026-04-14

### Changed

- Switched from removed `OpenAILLMContext` to universal `LLMContext` for
  Pipecat 1.0 compatibility. Context messages are now serialized using
  `get_messages(truncate_large_values=True)` for compact output.

- Bumped `pipecat-ai` dependency to `>=1.0.0`.

### Fixed

- Fixed a Whisker client issue that caused processor blinking to be delayed
  and trigger on processors that didn't receive new frames.

- Fixed a Whisker client issue where expanding a frame to see its details
  used a slow animation instead of showing the payload immediately.

- Fixed a Whisker client issue where the cursor would turn into a text
  I-beam when hovering over frame path items, making them look like they
  could be expanded like frames in the frames panel.

## [0.0.11] - 2026-01-12

### Added

- Added multi-select frame type filter with search capability, replacing the
  previous text input filter.

- Added PUSH/PROCESS checkboxes to filter frames by event type.

- Added UPSTREAM/DOWNSTREAM checkboxes to filter frames by direction.

- Added frame count display showing the number of filtered frames out of the
  total.

### Fixed

- Fixed an issue where the buffer data was not being sent to the client when
  closing.

- Fixed an issue that was causing data to be written to the output file after
  the file was already closed.

- Fixed an issue that could cause `WhiskerObserver` to crash if the given
  pipeline didn't have a previous processor.

- Fixed frame details not being selectable for copying by making only the
  header row clickable for expand/collapse.

## [0.0.10] - 2025-10-03

### Added

- Added Whisker frames: `WhiskerFrame` and `WhiskerUrgentFrame`. These frames
  are used to communicate with Whisker directly and will be displayed in a
  different color so it's easier to distinguish them. They can be used as a mark
  to know when something happened and easily see it in the Whisker client.

### Fixed

- Fixed a Whisker client issue that was causing a switch between light/dark
  themes when pressing 'd' inside the filter.

## [0.0.9] - 2025-09-24

## Added

- The Whisker client now displays Whisker/Pipecat/Python/Platform versions. This
  can be useful to know in which system the observer is/was running.

### Fixed

- Fixed an issue that would cause the client to display a blank page (with an
  error in the console) when loading a file after a previous network session was
  already loaded.

## [0.0.8] - 2025-09-18

### Changed

- We now just write one single file instead of one per client session.

  ```python
  whisker = WhiskerObserver(pipeline, file_name="whisker.bin")
  ```

### Fixed

- Fixed a client issue that was causing the pipeline to be reset when receving
  messages.

## [0.0.7] - 2025-09-18

### Added

- Allow saving sessions into a file and load them with the Whisker client.

### Changed

- Whisker now uses msgpack for streaming messages instead of JSON.

### Fixed

- Fixed an issue where processor flashing would be delayed.

## [0.0.6] - 2025-08-29

### Changed

- `WhiskerObserver` serializer function now gets an initial `BaseObserver`
  argument.

  ```python
  def serializer(observer: BaseObserver, frame: Frame)
  ```

  instead of

  ```python
  def serializer(frame: Frame)
  ```

### Fixed

- Fixed a `WhiskerObserver` serialization issue and catch exceptions if
  serialization fails.

- Fixed an issue that would prevent `WhiskerObserver` from shutting down the
  pipeline. Needs pipecat-ai > 0.0.82.

### Performance

- Avoid `WhiskerObserver` deepcopy and simply serialize fields.

## [0.0.5] - 2025-08-26

### Added

- Added the ability to pass custom serializer to `WhiskerObserver` via the
  `serializer` argument.

- Added `batch_size` argument to `WhiskerObserver` to indicate the maximum batch
  to buffer before sending a message to the client.

- Added a note to indicate that frames are buffered when the client is
  disconnected. This may cause memory growth on the server side.

### Fixed

- Fixed a `WhiskerObserver` where some frames would not be serialized properly.

## [0.0.4] - 2025-08-25

### Changed

- Ignore `InputAudioRawFrame` by default instead of `UserAudioRawFrame` which
  are less generic.

## [0.0.3] - 2025-08-25

### Fixed

- Fixed a `WhiskerObserver` issue that required a greater `websockets` version
  other than the specified one.

## [0.0.2] - 2025-08-25

### Fixed

- Cleanup frames and frame paths when a new pipeline is sent, and also cleanup
  selected elements.

- Fixed an issue in `WhiskerObserver` that would serialize strings as `str`
  instead of the actual string.

## [0.0.1] - 2025-08-25

Initial public release.
