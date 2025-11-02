<script setup lang="ts">
import { meter } from '@saraudio/meter';
import { useMeter, useRecorder } from '@saraudio/vue';
import { vadEnergy } from '@saraudio/vad-energy';

const rec = useRecorder({
  stages: [vadEnergy({ thresholdDb: -50, smoothMs: 100 }), meter()],
  segmenter: { preRollMs: 300, hangoverMs: 500 },
});

const meterLevels = useMeter({ pipeline: rec.pipeline });

async function handleStart() {
  await rec.start();
}

async function handleStop() {
  await rec.stop();
  meterLevels.reset();
}
</script>

<template>
  <div class="min-h-screen bg-gray-900 text-white p-8">
    <div class="max-w-4xl mx-auto">
      <h1 class="text-4xl font-bold mb-8">Saraudio Nuxt Demo</h1>

      <!-- Controls -->
      <div class="flex gap-4 mb-8">
        <button
          @click="handleStart"
          :disabled="rec.status.value === 'running' || rec.status.value === 'acquiring'"
          class="px-6 py-3 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg font-medium transition"
        >
          {{ rec.status.value === 'acquiring' ? 'Acquiring...' : 'Start' }}
        </button>
        <button
          @click="handleStop"
          :disabled="rec.status.value !== 'running'"
          class="px-6 py-3 bg-red-600 hover:bg-red-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg font-medium transition"
        >
          Stop
        </button>
      </div>

      <!-- Status -->
      <div class="mb-8 p-4 bg-gray-800 rounded-lg">
        <div class="text-sm text-gray-400 mb-2">Status</div>
        <div class="text-2xl font-mono">{{ rec.status.value }}</div>
      </div>

      <!-- Error -->
      <div v-if="rec.error.value" class="mb-8 p-4 bg-red-900/50 border border-red-500 rounded-lg">
        <div class="text-sm text-red-400 mb-2">Error</div>
        <div class="font-mono">{{ rec.error.value.message }}</div>
      </div>

      <!-- VAD -->
      <div class="mb-8 p-4 bg-gray-800 rounded-lg">
        <div class="text-sm text-gray-400 mb-2">Voice Activity Detection</div>
        <div class="flex items-center gap-4">
          <div
            :class="[
              'w-4 h-4 rounded-full transition',
              rec.vad.value?.speech ? 'bg-green-500' : 'bg-gray-600',
            ]"
          ></div>
          <div class="font-mono">{{ rec.vad.value?.speech ? 'Speech' : 'Silence' }}</div>
          <div class="text-gray-400 font-mono">
            Score: {{ rec.vad.value?.score.toFixed(2) ?? '0.00' }}
          </div>
        </div>
      </div>

      <!-- Meter -->
      <div class="mb-8 p-4 bg-gray-800 rounded-lg">
        <div class="text-sm text-gray-400 mb-2">Audio Levels</div>
        <div class="space-y-2">
          <div class="flex items-center gap-4">
            <div class="w-16 text-sm text-gray-400">RMS</div>
            <div class="flex-1 bg-gray-700 h-4 rounded overflow-hidden">
              <div
                class="bg-blue-500 h-full transition-all"
                :style="`width: ${Math.min(meterLevels.rms.value * 100, 100)}%`"
              ></div>
            </div>
            <div class="w-20 text-right font-mono text-sm">{{ meterLevels.rms.value.toFixed(3) }}</div>
          </div>
          <div class="flex items-center gap-4">
            <div class="w-16 text-sm text-gray-400">Peak</div>
            <div class="flex-1 bg-gray-700 h-4 rounded overflow-hidden">
              <div
                class="bg-green-500 h-full transition-all"
                :style="`width: ${Math.min(meterLevels.peak.value * 100, 100)}%`"
              ></div>
            </div>
            <div class="w-20 text-right font-mono text-sm">
              {{ meterLevels.peak.value.toFixed(3) }}
            </div>
          </div>
          <div class="flex items-center gap-4">
            <div class="w-16 text-sm text-gray-400">dB</div>
            <div class="w-20 text-right font-mono text-sm">
              {{ meterLevels.db.value === -Infinity ? '-∞' : meterLevels.db.value.toFixed(1) }}
            </div>
          </div>
        </div>
      </div>

      <!-- Segments -->
      <div class="p-4 bg-gray-800 rounded-lg">
        <div class="flex items-center justify-between mb-4">
          <div class="text-sm text-gray-400">Segments ({{ rec.segments.value.length }})</div>
          <button
            @click="rec.clearSegments"
            class="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded text-sm transition"
          >
            Clear
          </button>
        </div>
        <div v-if="rec.segments.value.length === 0" class="text-gray-500 text-center py-8">
          No segments yet
        </div>
        <div v-else class="space-y-2 max-h-96 overflow-y-auto">
          <div v-for="segment in rec.segments.value" :key="segment.id" class="p-3 bg-gray-700 rounded">
            <div class="flex items-center justify-between mb-1">
              <div class="font-mono text-xs text-gray-400">#{{ segment.id.slice(0, 8) }}</div>
              <div class="text-xs text-gray-400">{{ Math.round(segment.durationMs) }}ms</div>
            </div>
            <div class="text-sm">
              {{ new Date(segment.startMs).toLocaleTimeString() }} -
              {{ new Date(segment.endMs).toLocaleTimeString() }}
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
