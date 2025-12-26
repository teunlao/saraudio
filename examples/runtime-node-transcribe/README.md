# Runtime Node — Realtime transcription (mic/system)

Minimal Node.js example that captures audio and prints realtime transcripts to the terminal.

## Requirements

- macOS (CoreAudio capture via `@saraudio/capture-node`)
- Node.js 18+

## Environment

- `DEEPGRAM_API_KEY` — required for `--provider deepgram`
- `SONIOX_API_KEY` — required for `--provider soniox`

## Usage

```bash
# microphone + Deepgram
DEEPGRAM_API_KEY="..." pnpm --filter @saraudio/example-runtime-node-transcribe start -- --source mic --provider deepgram

# system audio + Soniox
SONIOX_API_KEY="..." pnpm --filter @saraudio/example-runtime-node-transcribe start -- --source system --provider soniox

# list available microphone devices (CoreAudio UIDs)
pnpm --filter @saraudio/example-runtime-node-transcribe start -- --list-mics
```

Press `Ctrl+C` to stop.
