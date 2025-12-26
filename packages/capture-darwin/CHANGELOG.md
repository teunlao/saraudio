# @saraudio/capture-darwin

## 0.2.1

### Patch Changes

- Fix macOS capture binary packaging: ensure `bin/saraudio-capture` is shipped as an executable to prevent `EACCES` when spawning.

## 0.2.0

### Minor Changes

- 99e2741: Add microphone device selection by CoreAudio device UID and expose `listMicrophoneDevices()` to discover available inputs.

## 0.1.0

### Minor Changes

- 6a5d18d: Add macOS CoreAudio capture for Node.js (system audio + microphone) with a bundled native binary.

## 0.0.1

- Initial package scaffolding (darwin capture)
