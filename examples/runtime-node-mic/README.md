# Runtime Node Microphone Example

Interactive CLI that captures microphone audio, pipes it into `@saraudio/runtime-node` with the energy VAD, prints speech events, and saves segments to disk.

- macOS: uses `@saraudio/capture-darwin` (Swift/CoreAudio)
- Linux/Windows: uses `ffmpeg`

## Requirements

- Node.js ≥ 18
- Operating system permission to record audio from the terminal
- macOS: macOS ≥ 14.2 (CoreAudio taps API baseline used by `@saraudio/capture-darwin`)
- Linux/Windows: `ffmpeg` installed with microphone access (Homebrew/apt/choco, etc.)

## Quick Start

```bash
pnpm install
pnpm --filter @saraudio/capture-darwin... build
pnpm --filter @saraudio/example-runtime-node-mic start
```

What happens on launch:

1. On macOS the CLI starts native microphone capture (CoreAudio) and streams PCM16 / 16 kHz mono.
2. On Linux/Windows the CLI uses `ffmpeg` to convert the chosen input into PCM16 / 16 kHz mono and streams it to stdout.
3. `createNodeRuntime()` runs a pipeline with `@saraudio/vad-energy` and the segmenter; the CLI prints `speechStart`, `speechEnd`, `segment` events plus a live VAD bar.
4. Each segment is written to `examples/runtime-node-mic/.segments/segment-<n>.wav` (git-ignored).

Stop the example with `Ctrl+C` — the script stops capture, flushes trailing audio, and disposes the pipeline.

## Configuring the input

### Environment shortcuts

- `FFMPEG_DEVICE` — quick way to point at a device without rewriting every flag (Linux/Windows only).
  - Linux (ALSA): `FFMPEG_DEVICE='hw:1,0' pnpm …`
  - Windows (dshow): `FFMPEG_DEVICE='Microphone (USB Audio)' pnpm …`

- `FFMPEG_INPUT_ARGS` — JSON array of strings that fully replaces the default ffmpeg input arguments (Linux/Windows only).

```bash
# macOS explicit array
FFMPEG_INPUT_ARGS='["-f","avfoundation","-i",":3"]' pnpm --filter @saraudio/example-runtime-node-mic start

# Linux (ALSA default device)
FFMPEG_INPUT_ARGS='["-f","alsa","-i","default"]' pnpm --filter @saraudio/example-runtime-node-mic start

# Windows (device name from `ffmpeg -list_devices true -f dshow -i dummy`)
FFMPEG_INPUT_ARGS='["-f","dshow","-i","audio=Microphone (Realtek)"]' pnpm --filter @saraudio/example-runtime-node-mic start
```

If the platform is not recognised, the script requires `FFMPEG_INPUT_ARGS` to be provided.

## Tuning VAD behaviour

- `ENERGY_THRESHOLD_DB` — energy threshold in dB (default `-55`). Lower it if the detector is too quiet, raise it if you get segments on background noise.
- `smoothMs`, `preRollMs`, `hangoverMs` are configured inline in `src/index.ts`; tweak them to experiment with latency vs. stability.

## Troubleshooting tips

- macOS: ensure the terminal has Microphone permission (System Settings → Privacy & Security → Microphone).
- Windows: list devices manually: `ffmpeg -hide_banner -list_devices true -f dshow -i dummy`
- On macOS, if `@saraudio/capture-darwin` can't find `bin/saraudio-capture`, run `pnpm --filter @saraudio/capture-darwin... build`.
- In non-interactive environments (e.g. launched from IDE) the prompt is skipped — set `FFMPEG_DEVICE` or `FFMPEG_INPUT_ARGS` explicitly (Linux/Windows).

Segments are WAV files. Play them with:

```bash
ffplay examples/runtime-node-mic/.segments/segment-1.wav

# macOS alternative:
afplay examples/runtime-node-mic/.segments/segment-1.wav
```
