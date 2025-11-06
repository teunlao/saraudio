# @saraudio/react

## 0.0.1

### Patch Changes

- Initial stable release of SARAUDIO audio processing stack
- Updated dependencies
  - @saraudio/core@0.0.1
  - @saraudio/meter@0.0.1
  - @saraudio/runtime-browser@0.0.1
  - @saraudio/utils@0.0.1
  - @saraudio/vad-energy@0.0.1

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
  - @saraudio/meter@0.0.0
  - @saraudio/runtime-browser@0.0.0
  - @saraudio/utils@0.0.0
  - @saraudio/vad-energy@0.0.0

## 0.0.0-alpha-20251103022458

### Major Changes

- Initial v3 alpha release

  ### Major Changes

  - Complete rewrite with modular architecture
  - New pipeline-based processing system
  - AudioWorklet support for 10ms latency
  - Automatic fallback to MediaRecorder
  - Framework bindings for React, Vue, Svelte, and Solid
  - TypeScript-first with full type safety
  - Tree-shakeable ESM builds

  ### Core Features

  - **@saraudio/core**: Pipeline engine with event-driven architecture
  - **@saraudio/utils**: DSP utilities and ring buffer implementation
  - **@saraudio/vad-energy**: Energy-based voice activity detection
  - **@saraudio/runtime-browser**: Browser runtime with AudioWorklet/MediaRecorder
  - **Framework bindings**: Hooks and composables for popular frameworks

  ### Breaking Changes

  This is a complete rewrite from v2. The API has changed significantly:

  ```typescript
  // Old (v2)
  import SilenceAwareRecorder from "silence-aware-recorder";
  const recorder = new SilenceAwareRecorder();

  // New (v3)
  import { useRecorder } from "@saraudio/react";
  import { vadEnergy } from "@saraudio/vad-energy";

  const { start, stop, segments } = useRecorder({
    stages: [vadEnergy()],
  });
  ```

  See migration guide for details.

### Patch Changes

- Updated dependencies
  - @saraudio/core@0.0.0-alpha-20251103022458
  - @saraudio/utils@0.0.0-alpha-20251103022458
  - @saraudio/vad-energy@0.0.0-alpha-20251103022458
  - @saraudio/meter@0.0.0-alpha-20251103022458
  - @saraudio/runtime-browser@0.0.0-alpha-20251103022458
