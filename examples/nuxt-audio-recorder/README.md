# Nuxt Audio Recorder Example

Full-featured demo showcasing advanced SARAUDIO capabilities with Nuxt 4.

## Key Features

**Reactive Configuration**
- Live VAD threshold and smoothing adjustment during recording
- Dynamic stage reconfiguration without restarting (`computed` stages → `useRecorder`)
- Runtime mode switching (worklet/media-recorder/auto)

**Complete Audio Pipeline**
- Device enumeration and selection with `useAudioInputs`
- Three export formats: cleaned (speech only), full session, masked (silence as zeros)
- Real-time segment capture with playback
- Audio level metering (RMS, peak, dB)

**Persistence**
- LocalStorage for VAD settings and preferences
- Device selection memory across sessions

## Run

```bash
pnpm serve
```

Open [http://localhost:3000](http://localhost:3000)

## Dynamic Stage Pattern

The demo keeps the VAD stage reactive by wrapping it in `computed` before passing it to `useRecorder`:

```ts
const runtimeStages = computed(() => [
  vadEnergy({ thresholdDb: thresholdDb.value, smoothMs: smoothMs.value }),
  meter(),
]);

const rec = useRecorder({
  stages: runtimeStages,
  segmenter: computed(() => ({ preRollMs: 300, hangoverMs: 500 })),
  constraints: audioConstraints,
  mode,
  allowFallback,
});
```

This mirrors the contract for all framework bindings: when a stage or segmenter config should change at runtime, pass a `ref`/`computed` so the hook can call `recorder.configure(...)` automatically.

## What This Example Shows

- **Dynamic reconfiguration** (`useRecorder` with reactive `stages` and `segmenter`)
- **Device management** (`useAudioInputs` with auto-select and persistence)
- **Multi-format recording** (cleaned/full/masked via `recordings` API)
- **Segment playback** (AudioContext + `segmentToAudioBuffer`)
- **SSR-safe composables** (Nuxt-compatible initialization)
