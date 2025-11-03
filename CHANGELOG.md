# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [3.0.0-alpha.1] - 2025-11-03

### Added

- Complete rewrite with modular architecture
- New pipeline-based processing system
- AudioWorklet support for 10ms latency
- Automatic fallback to MediaRecorder
- Framework bindings for React, Vue, Svelte, and Solid
- TypeScript-first with full type safety
- Tree-shakeable ESM builds
- Smart audio segmentation with pre-roll and hangover buffers
- Energy-based voice activity detection
- Real-time audio level metering
- Cross-platform support (browser, Node.js)

### Changed

- Moved from monolithic architecture to modular packages under `@saraudio/*` scope
- Improved API design with hooks and composables
- Reduced core bundle size from 87KB to 15KB

### Breaking Changes

- Complete API rewrite - see migration guide
- Package name changed from `silence-aware-recorder` to `@saraudio/*` packages
- Minimum Node.js version is now 18

### Packages

- `@saraudio/core` - Pipeline engine and base types
- `@saraudio/utils` - DSP utilities and helpers
- `@saraudio/vad-energy` - Energy-based VAD implementation
- `@saraudio/meter` - Audio level measurement
- `@saraudio/runtime-browser` - Browser runtime implementation
- `@saraudio/runtime-node` - Node.js runtime implementation
- `@saraudio/react` - React hooks
- `@saraudio/vue` - Vue composables
- `@saraudio/svelte` - Svelte stores
- `@saraudio/solid` - Solid primitives

[3.0.0-alpha.1]: https://github.com/teunlao/silence-aware-recorder/releases/tag/v3.0.0-alpha.1