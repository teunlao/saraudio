# SARAUDIO

Modular audio processing pipeline for real-time voice applications. Capture, detect speech, and process audio with minimal latency.

> ⚠️ **Active development** - APIs may change between releases.

## What is this?

SARAUDIO provides building blocks for audio processing:
- Real-time voice activity detection (VAD)
- Smart audio segmentation with configurable buffers
- Low-latency processing via AudioWorklet (10ms)
- Cross-platform support (browser, Node.js)

## Quick start

```bash
npm install @saraudio/react @saraudio/vad-energy
```

```tsx
import { useRecorder } from '@saraudio/react';
import { vadEnergy } from '@saraudio/vad-energy';

function App() {
  const { start, stop, segments } = useRecorder({
    stages: [vadEnergy({ thresholdDb: -50 })]
  });

  return (
    <>
      <button onClick={start}>Start</button>
      <button onClick={stop}>Stop</button>
      {segments.map(s => (
        <audio key={s.id} src={URL.createObjectURL(s.blob)} controls />
      ))}
    </>
  );
}
```

## Architecture

The pipeline processes audio through composable stages:

```
Audio Input → VAD Stage → Segmenter → Your App
                ↓
            Events (speech start/end, segments)
```

## Packages

### Core
- `@saraudio/core` - Pipeline engine and base types
- `@saraudio/utils` - DSP utilities (RMS, buffers, conversions)
- `@saraudio/vad-energy` - Energy-based voice detection
- `@saraudio/meter` - Audio level measurement

### Runtimes
- `@saraudio/runtime-browser` - Browser implementation (AudioWorklet/AudioContext)
- `@saraudio/runtime-node` - Node.js microphone support

### Framework bindings
- `@saraudio/react` - React hooks
- `@saraudio/vue` - Vue composables
- `@saraudio/svelte` - Svelte stores
- `@saraudio/solid` - SolidJS primitives

## Examples

Check the `examples/` directory for working demos:
- `react-mic-visualizer` - Real-time visualization with React
- `vue-audio-recorder` - Vue 3 composition API example  
- `svelte-audio-recorder` - Svelte example
- `solid-audio-recorder` - SolidJS example
- `runtime-browser-vanilla` - Pure JavaScript usage
- `runtime-node-mic` - Node.js recording

## Key features

- **Low latency** - 10ms with AudioWorklet, automatic fallback to AudioContext
- **Modular design** - Use only what you need, tree-shakeable
- **TypeScript first** - Full type safety and great DX

## Browser compatibility

- Chrome/Edge 90+ (AudioWorklet)
- Firefox 85+ (AudioWorklet)
- Safari 14.5+ (AudioWorklet with limitations)
- Older browsers use AudioContext fallback (higher latency)

## Development

```bash
# Install dependencies
pnpm install

# Run tests
pnpm test

# Build all packages
pnpm build

# Run example
cd examples/react-mic-visualizer
pnpm dev
```

## License

MIT
