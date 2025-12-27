## 0.0.2

## 0.2.0

### Minor Changes

- 4a01fea: feat: unify realtime transcription via `onUpdate` (token updates)

  Streaming transcription is now `onUpdate(TranscriptUpdate)`-only and exposes token-level `isFinal` + `finalize` boundaries.

  - Removes `onPartial` / `onTranscript` from the WebSocket stream + controller surface.
  - Updates Soniox + Deepgram WS adapters to emit token updates and expose typed `metadata`/`raw` helpers.
  - Updates the Vue hook + demos/docs to use `onUpdate`.

### Patch Changes

- Updated dependencies [4a01fea]
  - @saraudio/core@0.3.0
  - @saraudio/runtime-base@0.1.0

## 0.1.0

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
  - @saraudio/runtime-base@0.0.5

## 0.0.4

### Patch Changes

- 7c7e90f: Replace custom RuntimeLogger with Logger from @saraudio/utils
- Updated dependencies [7c7e90f]
  - @saraudio/core@0.1.1
  - @saraudio/runtime-base@0.0.4

## 0.0.3

### Patch Changes

- Updated dependencies [af17c99]
- Updated dependencies [af17c99]
  - @saraudio/core@0.1.0
  - @saraudio/utils@0.1.0
  - @saraudio/runtime-base@0.0.3

### Patch Changes

- 18c0fb1: Initial release
- Updated dependencies [18c0fb1]
  - @saraudio/core@0.0.2
  - @saraudio/utils@0.0.2
  - @saraudio/runtime-base@0.0.2
