# @saraudio/deepgram

## 1.0.0

### Minor Changes

- 0c61aa8: ## New Features

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
    ws: { silencePolicy: "drop" },
  });
  ```

  **After:**

  ```typescript
  createTranscription({
    provider,
    connection: {
      ws: {
        retry: { maxAttempts: 3 },
        silencePolicy: "drop",
      },
      http: {
        chunking: { intervalMs: 2500 },
      },
    },
  });
  ```

  ### New Exports

  - `ConnectionOptions`, `RetryOptions`, `HttpChunkingOptions` exported from `@saraudio/runtime-base`
  - Removed duplicate type definitions from `@saraudio/vue`

  ## Improvements

  - Add config warnings for invalid HTTP configurations (interval=0 without segment flush)
  - Comprehensive test coverage for HTTP+VAD scenarios (262 new test lines)
  - Vue composable now uses shared types from runtime-browser

### Patch Changes

- Updated dependencies [0c61aa8]
  - @saraudio/core@1.0.0

## 0.0.1

### Patch Changes

- Initial stable release of SARAUDIO audio processing stack
- Updated dependencies
  - @saraudio/core@0.0.1
  - @saraudio/utils@0.0.1

## 0.0.0

### Minor Changes

- 2d18dc4: Initial public release of SARAUDIO

  **Breaking Changes:**

  - Migrated from `silence-aware-recorder` to `@saraudio/*` namespace
  - Complete API redesign with modular architecture
  - New package structure: runtime-base, runtime-browser, runtime-node
  - Added transcription provider system with dynamic reconfiguration
  - Framework-agnostic core with bindings for React, Vue, Svelte, Solid

  **Core Features:**

  - Multi-source audio recording (microphone + desktop)
  - Voice Activity Detection (VAD) pipeline
  - Real-time audio processing with AudioWorklet
  - Transcription controller with WebSocket/HTTP support
  - Provider update API for dynamic reconfiguration
  - Comprehensive testing infrastructure

  **Packages:**

  - `@saraudio/core` - Pipeline engine and event system
  - `@saraudio/runtime-browser` - Browser runtime (AudioWorklet, MediaRecorder)
  - `@saraudio/runtime-node` - Node.js runtime
  - `@saraudio/react` - React hooks
  - `@saraudio/vue` - Vue 3 composables with reactive providers
  - `@saraudio/svelte` - Svelte stores
  - `@saraudio/solid` - Solid.js primitives
  - `@saraudio/deepgram` - Deepgram transcription provider
  - `@saraudio/meter` - Audio level metering
  - `@saraudio/vad-energy` - Energy-based VAD
  - `@saraudio/utils` - Shared utilities

### Patch Changes

- Updated dependencies [2d18dc4]
  - @saraudio/core@0.0.0
  - @saraudio/utils@0.0.0
