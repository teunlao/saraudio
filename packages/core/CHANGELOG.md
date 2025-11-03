# @saraudio/core

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
  - @saraudio/utils@0.0.0-alpha-20251103022458
