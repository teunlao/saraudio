# React Microphone Visualizer (Vite 7 + React 19)

This example demonstrates how to use `@saraudio/react` in the browser: the application creates a pipeline with energy VAD, starts the microphone, and displays voice activity in real time.

## Scripts

```bash
pnpm install                           # once in the monorepo root
pnpm --filter @saraudio/example-react-mic-visualizer dev      # start dev server at http://localhost:5173
pnpm --filter @saraudio/example-react-mic-visualizer build    # production build
pnpm --filter @saraudio/example-react-mic-visualizer preview  # preview the build
pnpm --filter @saraudio/example-react-mic-visualizer typecheck
pnpm --filter @saraudio/example-react-mic-visualizer lint
```

## Features

- React 19 + Vite 7.
- `SaraudioProvider` creates the browser runtime automatically.
- `useSaraudioPipeline` + `useSaraudioMicrophone` form the PCM stream and segments (using the selected microphone).
- Live VAD + separate input level indicator and recent event log for debugging.
- Built-in device selection with instant list updates without restarting the app; threshold (dB) and smoothing can be adjusted.
- Hook reports fallbacks (e.g., switching to AudioContext).

## Requirements

- Node ≥ 18, pnpm ≥ 10.
- Run on `localhost` via HTTPS/HTTP or on a production domain with HTTPS, otherwise the browser won't grant microphone access.
