# Changelog

All notable changes to **Pipecat** will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
