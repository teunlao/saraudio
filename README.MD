# SARAudio
Modular audio toolkit and transcription SDK for real‑time voice applications. Works with any transcription provider, cross‑platform.

> ⚠️ Active development - APIs may change between releases.

## Highlights

- Batteries‑included: recorder, VAD/segments, HTTP/WS transports, provider adapters.
- Provider‑agnostic: Deepgram and Soniox behind one interface; swap without rewrites.
- Silence‑aware by design: WS `keep|drop|mute`, HTTP “segment‑only” (flush on VAD segment end).
- Cross‑platform: Browser (AudioWorklet/AudioContext) and Node.
- Type‑safe: clear options, no vendor lock‑in.

---

## Quickstart (WebSocket)

```bash
# Required
pnpm add @saraudio/runtime-browser @saraudio/deepgram

# Optional stages (VAD + Meter)
pnpm add @saraudio/vad-energy @saraudio/meter
```

```ts
import { createRecorder, createTranscription } from '@saraudio/runtime-browser';
import { deepgram } from '@saraudio/deepgram';
import { vadEnergy } from '@saraudio/vad-energy';
import { meter } from '@saraudio/meter';

const provider = deepgram({ model: 'nova-3', auth: { apiKey: '<DEEPGRAM_API_KEY>' } });

const recorder = createRecorder({
  format: { sampleRate: 16000, channels: 1 },
  stages: [vadEnergy({ thresholdDb: -50, attackMs: 80, releaseMs: 200 }), meter()],
  segmenter: true,
});

const ctrl = createTranscription({
  provider,
  recorder,
  transport: 'websocket',
  connection: { ws: { silencePolicy: 'keep' } }, // 'keep' | 'drop' | 'mute'
});

ctrl.onPartial((t) => console.log('partial:', t));
ctrl.onTranscript((r) => console.log('final:', r.text));

await recorder.start();
await ctrl.connect();
```

## Quickstart (HTTP, segment‑only)

```ts
const ctrl = createTranscription({
  provider,
  recorder,
  transport: 'http',
  flushOnSegmentEnd: true,
  connection: { http: { chunking: { intervalMs: 0, overlapMs: 500, maxInFlight: 1, timeoutMs: 10_000 } } },
});

ctrl.onTranscript((r) => console.log('final:', r.text));
await recorder.start();
await ctrl.connect();
```

## Quickstart (Vue + WS)

```bash
# Required
pnpm add @saraudio/vue @saraudio/deepgram

# Optional stages (VAD + Meter)
pnpm add @saraudio/vad-energy @saraudio/meter
```

```vue
<script setup lang="ts">
import { useTranscription } from '@saraudio/vue'
import { deepgram } from '@saraudio/deepgram'

const provider = deepgram({ model: 'nova-3', auth: { apiKey: '<KEY>' } })
const { start, stop, connect, disconnect, partial, transcript, status } = useTranscription({
  provider,
  transport: 'websocket',
  autoConnect: true,
  stages: [vadEnergy({ thresholdDb: -50, attackMs: 80, releaseMs: 200 }), meter()],
  connection: { ws: { silencePolicy: 'keep' } },
})
</script>

<template>
  <p>Status: {{ status }}</p>
  <div v-if="partial">Partial: {{ partial }}</div>
  <div v-if="transcript">Final: {{ transcript }}</div>
  <button @click="start?.()">Start mic</button>
  <button @click="stop?.()">Stop mic</button>
  <button @click="connect">Connect</button>
  <button @click="disconnect">Disconnect</button>
  
</template>
```

---

## Providers

- `@saraudio/deepgram` — WS realtime + HTTP chunked transcription (use raw model IDs like `nova-3`).
- `@saraudio/soniox` — WS realtime (`stt-rt-v3`) + HTTP batch via Files API (`stt-async-v3`).

See provider pages in docs for options, models, and error handling.

## Packages

- `@saraudio/core` — core types and pipeline building blocks
- `@saraudio/runtime-base` — controller, transports, utilities
- `@saraudio/runtime-browser` — browser runtime (AudioWorklet/AudioContext)
- `@saraudio/runtime-node` — Node runtime utilities (server‑side capture/streaming & batch helpers)
- `@saraudio/deepgram` — Deepgram provider
- `@saraudio/soniox` — Soniox provider
- `@saraudio/vue` — Vue 3 composables (hooks)
- `@saraudio/react` — React hooks (coming in examples)
- `@saraudio/svelte` — Svelte stores
- `@saraudio/solid` — Solid primitives
- `@saraudio/vad-energy` — energy‑based VAD stage
- `@saraudio/meter` — input level meter stage

## Requirements

- HTTPS (or `localhost`) for microphone access.
- For lowest latency (AudioWorklet + SharedArrayBuffer) enable cross‑origin isolation.

## Documentation

- Live site: coming soon
- Local: `cd docs && pnpm dev` (Astro Starlight)

## Development

```bash
pnpm install
pnpm typecheck && pnpm lint && pnpm test
pnpm build
```

## License

MIT
