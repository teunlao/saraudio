<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  vadSpeech?: boolean | null;
  vadScore?: number | null;
  rms?: number;
  db?: number;
  transport?: 'websocket' | 'http' | string;
  manualWs?: boolean;
}>();

const transportText = computed(() => {
  if (!props.transport) return null;
  if (props.manualWs) return 'Manual WebSocket client for Deepgram realtime API';
  return 'Managed by useTranscription with retry and backoff';
});
</script>

<template>
  <section class="grid lg:grid-cols-3 gap-6">
    <div class="p-4 bg-gray-800 rounded space-y-2">
      <h2 class="text-lg font-semibold">VAD</h2>
      <div class="flex items-center gap-3">
        <div :class="['w-4 h-4 rounded-full', props.vadSpeech ? 'bg-green-500' : 'bg-gray-600']"></div>
        <span class="font-mono">{{ props.vadScore?.toFixed(2) ?? '0.00' }}</span>
      </div>
    </div>
    <div class="p-4 bg-gray-800 rounded space-y-2">
      <h2 class="text-lg font-semibold">RMS</h2>
      <div class="h-2 bg-gray-700 rounded overflow-hidden">
        <div class="h-full bg-blue-500 transition-all" :style="`width:${Math.min((props.rms ?? 0) * 100, 100)}%`" />
      </div>
      <div class="text-sm text-gray-400">
        {{ props.db === undefined || props.db === -Infinity ? '-∞' : props.db.toFixed(1) }} dB
      </div>
    </div>
    <div v-if="transport" class="p-4 bg-gray-800 rounded space-y-2">
      <h2 class="text-lg font-semibold">Transport</h2>
      <div class="font-mono text-sm">{{ transport }}</div>
      <div v-if="transportText" class="text-xs text-gray-400">{{ transportText }}</div>
    </div>
  </section>
</template>
