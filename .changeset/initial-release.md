---
"@saraudio/core": minor
"@saraudio/deepgram": minor
"@saraudio/meter": minor
"@saraudio/react": minor
"@saraudio/runtime-base": minor
"@saraudio/runtime-browser": minor
"@saraudio/runtime-node": minor
"@saraudio/solid": minor
"@saraudio/svelte": minor
"@saraudio/utils": minor
"@saraudio/vad-energy": minor
"@saraudio/vue": minor
---

Initial public release of SARAUDIO

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
