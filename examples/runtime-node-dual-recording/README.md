# Runtime Node Dual Recording Example (macOS)

Records **two separate WAV files** at once:

- `<timestamp>-system.wav` — system audio via CoreAudio taps
- `<timestamp>-mic.wav` — microphone via CoreAudio (default input)

Stops on `Ctrl+C` or by typing `stop` and saves files you can listen to.

## Requirements

- Node.js ≥ 18
- macOS ≥ 14.2
- Terminal permissions:
  - Microphone permission for mic capture
  - System Audio recording permission for system capture (depending on macOS settings)

## Run

```bash
pnpm install
pnpm --filter @saraudio/capture-darwin... build
pnpm --filter @saraudio/capture-node build
pnpm --filter @saraudio/example-runtime-node-dual-recording start
```

Files are saved into `examples/runtime-node-dual-recording/.recordings/`.
