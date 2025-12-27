---
'@saraudio/core': minor
'@saraudio/runtime-base': minor
'@saraudio/runtime-browser': minor
'@saraudio/runtime-node': minor
'@saraudio/deepgram': minor
'@saraudio/soniox': minor
'@saraudio/vue': minor
---

feat: unify realtime transcription via `onUpdate` (token updates)

Streaming transcription is now `onUpdate(TranscriptUpdate)`-only and exposes token-level `isFinal` + `finalize` boundaries.

- Removes `onPartial` / `onTranscript` from the WebSocket stream + controller surface.
- Updates Soniox + Deepgram WS adapters to emit token updates and expose typed `metadata`/`raw` helpers.
- Updates the Vue hook + demos/docs to use `onUpdate`.
