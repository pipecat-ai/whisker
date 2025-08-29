# Changelog

All notable changes to **Pipecat** will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## Changed

- `WhiskerObserver` serializer function now gets an initial `BaseObserver`
  argument.

  ```python
  def serializer(observer: BaseObserver, frame: Frame)
  ```

  instead of

  ```python
  def serializer(frame: Frame)
  ```

## Fixed

- Fixed a `WhiskerObserver` serialization issue and catch exceptions if
  serialization fails.

- Fixed an issue that would prevent `WhiskerObserver` from shutting down the
  pipeline. Needs pipecat-ai > 0.0.82.

# Performance

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
