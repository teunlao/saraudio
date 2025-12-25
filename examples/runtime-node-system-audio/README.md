# Runtime Node System Audio Example (macOS)

Interactive CLI that captures **system audio** on macOS via `@saraudio/capture-darwin` (Swift/CoreAudio taps), pipes it into `@saraudio/runtime-node` with the energy VAD, prints speech events, and saves segments to disk.

## Requirements

- Node.js ≥ 18
- macOS ≥ 14.2
- System permission to capture audio (and to run the terminal)

## Quick Start

```bash
pnpm install
pnpm --filter @saraudio/capture-darwin... build
pnpm --filter @saraudio/example-runtime-node-system-audio start
```

Play some audio (e.g. music/video) and watch `speechStart`, `speechEnd`, and `segment` events.

Segments are written to `examples/runtime-node-system-audio/.segments/segment-<n>.wav` (git-ignored).

## Troubleshooting

- If you get silence, ensure something is playing and check macOS privacy permissions.
- If `@saraudio/capture-darwin` can't find `bin/saraudio-capture`, run `pnpm --filter @saraudio/capture-darwin... build`.
