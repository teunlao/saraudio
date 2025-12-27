# @saraudio/soniox

## 0.3.0

### Minor Changes

- 4a01fea: feat: unify realtime transcription via `onUpdate` (token updates)

  Streaming transcription is now `onUpdate(TranscriptUpdate)`-only and exposes token-level `isFinal` + `finalize` boundaries.

  - Removes `onPartial` / `onTranscript` from the WebSocket stream + controller surface.
  - Updates Soniox + Deepgram WS adapters to emit token updates and expose typed `metadata`/`raw` helpers.
  - Updates the Vue hook + demos/docs to use `onUpdate`.

### Patch Changes

- Updated dependencies [4a01fea]
  - @saraudio/core@0.3.0

## 0.2.1

### Patch Changes

- a4776af: Enable speaker diarization for Deepgram and Soniox and align provider options via `diarization: true`.

## 0.2.0

### Minor Changes

- f66709f: feat: add unified session auth system for ephemeral tokens

  - **@saraudio/core**: export SessionAuthAdapter, SessionAuthIssueResult, ProviderId types
  - **@saraudio/deepgram**: add `/server` subpath export with sessionAuthAdapter
  - **@saraudio/soniox**: add `/server` subpath export with sessionAuthAdapter
  - **@saraudio/runtime-node**: add createSessionAuthHandler for unified endpoint

  Unified API returns `{ token: string, expiresIn: number }` for both providers.
  Server-side adapters use standard SessionAuthAdapter interface.

### Patch Changes

- Updated dependencies [f66709f]
  - @saraudio/core@0.2.0

## 0.1.2

### Patch Changes

- f333aa8: fix(soniox): change auth priority to getToken → token → apiKey (matches Deepgram pattern, encourages secure ephemeral tokens)

## 0.1.1

### Patch Changes

- Updated dependencies [7c7e90f]
  - @saraudio/core@0.1.1

## 0.1.0

### Minor Changes

- af17c99: Add Files API for batch HTTP transcription, improve WS transport token handling and word timestamps, refactor to use shared utilities

### Patch Changes

- Updated dependencies [af17c99]
- Updated dependencies [af17c99]
  - @saraudio/core@0.1.0
  - @saraudio/utils@0.1.0

## 0.0.3

### Patch Changes

- 9709496: Improve Soniox WebSocket transport: filter control markers, fix token coalescing, and improve word timestamp accuracy

## 0.0.2

### Patch Changes

- 18c0fb1: Initial release
- Updated dependencies [18c0fb1]
  - @saraudio/core@0.0.2
  - @saraudio/utils@0.0.2
