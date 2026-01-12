# Changelog

All notable changes to **Whisker** will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
