# @saraudio/capture-node

## 0.2.4

### Patch Changes

- Updated dependencies [4a01fea]
  - @saraudio/core@0.3.0

## 0.2.3

### Patch Changes

- 8c4d95f: Fix System Audio Recording permission preflight on macOS (TCCAccessPreflight result mapping) and expose the raw `tccPreflight` code for debugging.

## 0.2.2

### Patch Changes

- a3a6203: Add OS-level System Audio Recording permission preflight, and harden macOS capture startup.

  - `@saraudio/capture-darwin`: auto-fix missing executable bit on bundled `saraudio-capture`, add `--preflight-system-audio` (JSON), and avoid silent hangs on early stream failures.
  - `@saraudio/capture-node`: expose `preflightSystemAudioPermission()` on macOS.

## 0.2.1

### Patch Changes

- Fix macOS capture binary packaging: ensure `bin/saraudio-capture` is shipped as an executable to prevent `EACCES` when spawning.

## 0.2.0

### Minor Changes

- 99e2741: Add microphone device selection by CoreAudio device UID and expose `listMicrophoneDevices()` to discover available inputs.

## 0.1.0

### Minor Changes

- 414a186: Add `@saraudio/capture-node` as the cross-platform Node capture entrypoint (macOS supported via `@saraudio/capture-darwin`).
