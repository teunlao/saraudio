# runtime-node-system-audio-permissions

Minimal repro harness for macOS **System Audio Recording** permission behavior.

## Run

```bash
pnpm --filter @saraudio/example-runtime-node-system-audio-permissions start
```

Optional env vars:

- `CAPTURE_DURATION_MS` (default: `1500`) — how long to run capture probe
- `FRAME_SIZE` (default: `160`) — frame size in samples at 16kHz (160 = 10ms)
- `RUN_CAPTURE=0` — only run permission preflight, skip capture attempt

## What it does

1) Calls `preflightSystemAudioPermission()` (spawns `saraudio-capture --preflight-system-audio`)
2) Optionally attempts to start a system-audio source and counts frames / signal level stats

