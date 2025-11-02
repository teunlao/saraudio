# @saraudio/vue

Vue 3 Composition API bindings for SARAUDIO audio pipeline.

## Installation

```bash
pnpm add @saraudio/vue @saraudio/runtime-browser
```

## Usage

```vue
<script setup lang="ts">
import { useRecorder, useMeter } from '@saraudio/vue';
import { vadEnergy } from '@saraudio/vad-energy';
import { meter } from '@saraudio/meter';

const rec = useRecorder({
  stages: [vadEnergy({ thresholdDb: -50 }), meter()],
  segmenter: { preRollMs: 300, hangoverMs: 500 },
});

const meterLevels = useMeter({ pipeline: rec.pipeline });
</script>

<template>
  <button @click="rec.start()">Start</button>
  <button @click="rec.stop()">Stop</button>

  <p>Status: {{ rec.status }}</p>
  <p>Segments: {{ rec.segments.length }}</p>

  <div v-if="rec.vad">
    <p>Speech: {{ rec.vad.speech ? 'Yes' : 'No' }}</p>
  </div>

  <div v-for="segment in rec.segments" :key="segment.id">
    {{ segment.id }}
  </div>
</template>
```

**Note:** Runtime is created automatically. You can optionally pass your own:

```vue
<script setup lang="ts">
import { useRecorder } from '@saraudio/vue';
import { createBrowserRuntime } from '@saraudio/runtime-browser';

const runtime = createBrowserRuntime();
const rec = useRecorder({ runtime, stages: [...] });
</script>
```

## API

### `useRecorder(options)`

Creates a reactive recorder instance with Vue 3 Composition API.

**Returns:**
- `recorder` - Recorder instance (Ref)
- `status` - Current status (Ref)
- `error` - Last error (Ref)
- `segments` - Array of recorded segments (Ref)
- `vad` - Current VAD score (Ref)
- `pipeline` - Audio pipeline instance (Ref)
- `start()` - Start recording
- `stop()` - Stop recording
- `reset()` - Reset recorder state
- `clearSegments()` - Clear segments array

### `useMeter(options)`

Tracks audio levels from a pipeline.

**Options:**
- `pipeline` - Pipeline instance or Ref<Pipeline>
- `onMeter` - Optional callback for meter events

**Returns:**
- `rms` - RMS level (Ref)
- `peak` - Peak level (Ref)
- `db` - Decibel level (Ref)
- `reset()` - Reset meter values

### `useAudioInputs(options?)`

Manages audio input device selection.

**Returns:**
- `devices` - Available devices (Ref)
- `selectedDeviceId` - Selected device ID (Ref)
- `enumerating` - Loading state (Ref)
- `error` - Error message (Ref)
- `refresh()` - Refresh device list

## Requirements

- Vue 3.0.0 or higher (Composition API)
