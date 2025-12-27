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

const provider = deepgram({
  model: 'nova-3',
  auth: { apiKey: '<DEEPGRAM_API_KEY>' }, // server-side only; in browsers prefer auth.getToken for ephemeral tokens
});

const recorder = createRecorder({
  format: { sampleRate: 16000, channels: 1 },
  stages: [vadEnergy({ thresholdDb: -50, smoothMs: 50 }), meter()],
  segmenter: { preRollMs: 120, hangoverMs: 250 },
});

const ctrl = createTranscription({
  provider,
  recorder,
  transport: 'websocket',
  connection: { ws: { silencePolicy: 'keep' } }, // 'keep' | 'drop' | 'mute'
});

ctrl.onUpdate((u) => {
  const finalChunk = u.tokens
    .filter((t) => t.isFinal)
    .map((t) => t.text)
    .join('')
    .trim();
  const partialText = u.tokens
    .filter((t) => !t.isFinal)
    .map((t) => t.text)
    .join('');
  if (partialText) console.log('partial:', partialText);
  if (finalChunk) console.log('final:', finalChunk);
});

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

ctrl.onUpdate((u) => {
  const text = u.tokens.map((t) => t.text).join('').trim();
  if (text) console.log('final:', text);
});
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
import { vadEnergy } from '@saraudio/vad-energy'
import { meter } from '@saraudio/meter'

const provider = deepgram({
  model: 'nova-3',
  auth: { apiKey: '<KEY>' }, // server-side only; in browsers prefer auth.getToken for ephemeral tokens
})
const { start, stop, connect, disconnect, partial, transcript, status } = useTranscription({
  provider,
  transport: 'websocket',
  autoConnect: true,
  stages: [vadEnergy({ thresholdDb: -50, smoothMs: 50 }), meter()],
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

See provider TypeScript options/types (`DeepgramOptions`, `SonioxOptions`) for full configuration.

## Packages

- `@saraudio/core` — core types and pipeline building blocks
- `@saraudio/runtime-base` — controller, transports, utilities
- `@saraudio/runtime-browser` — browser runtime (AudioWorklet/AudioContext)
- `@saraudio/runtime-node` — Node runtime utilities (server‑side capture/streaming & batch helpers)
- `@saraudio/capture-node` — Node capture entrypoint (macOS supported; Windows/Linux coming later)
- `@saraudio/capture-darwin` — macOS CoreAudio capture for Node (system audio + mic)
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

- Docs site is WIP.
- For now, use `examples/*` and the package-level READMEs/types.

## Development

```bash
pnpm install
pnpm typecheck && pnpm lint && pnpm test
pnpm build
```

## License

MIT
