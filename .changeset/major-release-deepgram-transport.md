---
'@saraudio/core': minor
'@saraudio/deepgram': minor
'@saraudio/runtime-base': minor
'@saraudio/runtime-browser': minor
'@saraudio/runtime-node': minor
'@saraudio/vue': minor
'@saraudio/react': minor
'@saraudio/svelte': minor
'@saraudio/solid': minor
---

## New Features

### Deepgram Provider
- Add complete Deepgram transcription provider with HTTP and WebSocket support
- Transport strategy pattern for automatic WebSocket/HTTP selection
- Comprehensive test coverage for streaming and batch transcription

### Speech-Gated Frame Subscriptions
- Add `subscribeSpeechFrames()` for normalized speech-only frames
- Add `subscribeSpeechRawFrames()` for raw speech-only frames
- HTTP transport auto-subscribes to speech frames when `flushOnSegmentEnd=true`
- Automatic `intervalMs=0` default for segment-driven HTTP mode

### Transport Selection Architecture
- Add `defineProvider()` helper with type guards and runtime validation
- Transport declarations in provider capabilities (`transports: { http, websocket }`)
- Transport selection moved to controller level (not provider)
- Support for `transport: 'auto' | 'websocket' | 'http'` in controller options

## Breaking Changes

### Unified Connection Options
Connection options are now nested under `connection` field:

**Before:**
```typescript
createTranscription({
  provider,
  retry: { maxAttempts: 3 },
  chunking: { intervalMs: 2500 },
  ws: { silencePolicy: 'drop' }
})
```

**After:**
```typescript
createTranscription({
  provider,
  connection: {
    ws: {
      retry: { maxAttempts: 3 },
      silencePolicy: 'drop'
    },
    http: {
      chunking: { intervalMs: 2500 }
    }
  }
})
```

### New Exports
- `ConnectionOptions`, `RetryOptions`, `HttpChunkingOptions` exported from `@saraudio/runtime-base`
- Removed duplicate type definitions from `@saraudio/vue`

## Improvements

- Add config warnings for invalid HTTP configurations (interval=0 without segment flush)
- Comprehensive test coverage for HTTP+VAD scenarios (262 new test lines)
- Vue composable now uses shared types from runtime-browser
