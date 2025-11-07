<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  startDisabled?: boolean;
  stopDisabled?: boolean;
  forceDisabled?: boolean;
  showForce?: boolean;
  status?: string;
  isConnected?: boolean;
}>();

const emit = defineEmits<{
  start: [];
  stop: [];
  force: [];
}>();

const statusText = computed(() => {
  if (!props.status) return null;
  const connectedText = props.isConnected !== undefined ? ` · Connected: ${props.isConnected ? 'yes' : 'no'}` : '';
  return `Status: ${props.status}${connectedText}`;
});

const start = () => emit('start');
const stop = () => emit('stop');
const force = () => emit('force');
</script>

<template>
  <div class="flex flex-wrap items-center gap-4">
    <button
      type="button"
      class="px-4 py-2 bg-green-600 hover:bg-green-500 rounded disabled:opacity-40 disabled:cursor-not-allowed transition"
      :disabled="startDisabled"
      @click="start"
    >
      Start
    </button>
    <button
      type="button"
      class="px-4 py-2 bg-red-600 hover:bg-red-500 rounded disabled:opacity-40 disabled:cursor-not-allowed transition"
      :disabled="stopDisabled"
      @click="stop"
    >
      Stop
    </button>
    <button
      v-if="showForce"
      type="button"
      class="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded disabled:opacity-40 disabled:cursor-not-allowed transition"
      :disabled="forceDisabled"
      @click="force"
    >
      Force Endpoint
    </button>
    <span v-if="statusText" class="px-3 py-1 bg-gray-700 rounded text-sm">{{ statusText }}</span>
    <slot />
  </div>
</template>
