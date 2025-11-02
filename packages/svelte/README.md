# @saraudio/svelte

Svelte 5 bindings for SARAUDIO audio pipeline.

## Installation

```bash
pnpm add @saraudio/svelte @saraudio/runtime-browser
```

## Usage

```svelte
<script>
import { createRecorder } from '@saraudio/svelte';
import { vadEnergy } from '@saraudio/vad-energy';
import { meter } from '@saraudio/meter';

const rec = createRecorder({
  stages: [vadEnergy({ thresholdDb: -50 }), meter()],
  segmenter: { preRollMs: 300, hangoverMs: 500 },
});
</script>

<button onclick={() => rec.start()}>Start</button>
<button onclick={() => rec.stop()}>Stop</button>

<p>Status: {rec.status}</p>
<p>Segments: {rec.segments.length}</p>

{#if rec.vad}
  <p>Speech: {rec.vad.speech ? 'Yes' : 'No'}</p>
{/if}

{#each rec.segments as segment}
  <div>{segment.id}</div>
{/each}
```

**Note:** Runtime is created automatically. You can optionally pass your own:

```svelte
<script>
import { createRecorder } from '@saraudio/svelte';
import { createBrowserRuntime } from '@saraudio/runtime-browser';

const runtime = createBrowserRuntime();
const rec = createRecorder({ runtime, stages: [...] });
</script>
```

## API

### `createRecorder(options)`

Creates a reactive recorder instance with Svelte 5 runes.

**Returns:**
- `recorder` - Recorder instance
- `status` - Current status ('idle' | 'acquiring' | 'running' | 'stopping' | 'error')
- `error` - Last error (if any)
- `segments` - Array of recorded segments
- `vad` - Current VAD score
- `pipeline` - Audio pipeline instance
- `start()` - Start recording
- `stop()` - Stop recording
- `reset()` - Reset recorder state
- `clearSegments()` - Clear segments array

## Requirements

- Svelte 5.0.0 or higher
