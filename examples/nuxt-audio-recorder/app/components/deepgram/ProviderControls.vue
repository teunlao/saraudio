<script setup lang="ts">
import type { RuntimeMode } from '@saraudio/runtime-browser';

interface ModelEntry {
  id: string;
  label: string;
}

const props = defineProps<{
  model: string;
  language: string;
  mode: RuntimeMode;
  models: ReadonlyArray<ModelEntry>;
  languages: ReadonlyArray<string>;
  modeDisabled?: boolean;
  transport?: 'websocket' | 'http';
  transportDisabled?: boolean;
}>();

const emit = defineEmits<{
  'update:model': [string];
  'update:language': [string];
  'update:mode': [RuntimeMode];
  'update:transport': ['websocket' | 'http'];
}>();

const updateModel = (event: Event) => emit('update:model', (event.target as HTMLSelectElement | null)?.value ?? props.model);
const updateLanguage = (event: Event) => emit('update:language', (event.target as HTMLSelectElement | null)?.value ?? props.language);
const updateMode = (event: Event) => emit('update:mode', ((event.target as HTMLSelectElement | null)?.value as RuntimeMode | undefined) ?? props.mode);
const updateTransport = (event: Event) => {
  const value = (event.target as HTMLSelectElement | null)?.value;
  if (value === 'websocket' || value === 'http') emit('update:transport', value);
};
</script>

<template>
  <div :class="['grid gap-4', props.transport ? 'sm:grid-cols-4' : 'sm:grid-cols-3']">
    <div>
      <label class="block text-sm text-gray-400 mb-1">Model</label>
      <select
        :value="model"
        @input="updateModel"
        class="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded focus:ring-2 focus:ring-blue-500"
      >
        <option v-for="entry in models" :key="entry.id" :value="entry.id">{{ entry.label }}</option>
      </select>
    </div>
    <div>
      <label class="block text-sm text-gray-400 mb-1">Language</label>
      <select
        :value="language"
        @input="updateLanguage"
        class="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded focus:ring-2 focus:ring-blue-500"
      >
        <option v-for="lang in languages" :key="lang" :value="lang">{{ lang }}</option>
      </select>
    </div>
    <div>
      <label class="block text-sm text-gray-400 mb-1">Capture Mode</label>
      <select
        :value="mode"
        @input="updateMode"
        :disabled="modeDisabled"
        class="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
      >
        <option value="auto">Auto</option>
        <option value="worklet">AudioWorklet</option>
        <option value="media-recorder">MediaRecorder</option>
      </select>
    </div>
    <div v-if="props.transport">
      <label class="block text-sm text-gray-400 mb-1">Transport</label>
      <select
        :value="props.transport"
        @input="updateTransport"
        :disabled="props.transportDisabled"
        class="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
      >
        <option value="websocket">WebSocket</option>
        <option value="http">HTTP</option>
      </select>
    </div>
  </div>
</template>
