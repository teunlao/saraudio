<script setup lang="ts">
import type { Segment, VADScore } from '@saraudio/core';
import { meter } from '@saraudio/meter';
import type { Recorder, RecorderStatus } from '@saraudio/runtime-browser';
import { createRecorder } from '@saraudio/runtime-browser';
import { vadEnergy } from '@saraudio/vad-energy';
import { onMounted, onUnmounted, ref } from 'vue';

const recorder = ref<Recorder | null>(null);
const status = ref<RecorderStatus>('idle');
const error = ref<Error | null>(null);
const segments = ref<Segment[]>([]);
const meterLevels = ref({ rms: 0, peak: 0, db: -Infinity });
const vadScore = ref<number>(0);
const isSpeech = ref(false);

onMounted(() => {
  const rec = createRecorder({
    stages: [vadEnergy({ thresholdDb: -50, smoothMs: 100 }), meter()],
    segmenter: { preRollMs: 300, hangoverMs: 500 },
  });
  recorder.value = rec;

  const vadUnsub = rec.onVad((v: VADScore) => {
    vadScore.value = v.score;
    isSpeech.value = v.speech;
  });

  const segmentUnsub = rec.onSegment((s: Segment) => {
    segments.value = segments.value.length >= 10 ? [...segments.value.slice(1), s] : [...segments.value, s];
  });

  const errorUnsub = rec.onError((e) => {
    error.value = new Error(e.message);
  });

  const meterUnsub = rec.pipeline.events.on('meter', (payload) => {
    meterLevels.value = { rms: payload.rms, peak: payload.peak, db: payload.db };
  });

  onUnmounted(() => {
    vadUnsub.unsubscribe();
    segmentUnsub.unsubscribe();
    errorUnsub.unsubscribe();
    meterUnsub();
    rec.dispose();
  });
});

async function handleStart() {
  if (!recorder.value) return;
  try {
    status.value = 'acquiring';
    await recorder.value.start();
    status.value = 'running';
  } catch (e) {
    error.value = e instanceof Error ? e : new Error(String(e));
    status.value = 'error';
  }
}

async function handleStop() {
  if (!recorder.value) return;
  try {
    status.value = 'stopping';
    await recorder.value.stop();
    status.value = 'idle';
    meterLevels.value = { rms: 0, peak: 0, db: -Infinity };
  } catch (e) {
    error.value = e instanceof Error ? e : new Error(String(e));
    status.value = 'error';
  }
}

function clearSegments() {
  segments.value = [];
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
          :disabled="status === 'running' || status === 'acquiring'"
          class="px-6 py-3 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg font-medium transition"
        >
          {{ status === 'acquiring' ? 'Acquiring...' : 'Start' }}
        </button>
        <button
          @click="handleStop"
          :disabled="status !== 'running'"
          class="px-6 py-3 bg-red-600 hover:bg-red-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg font-medium transition"
        >
          Stop
        </button>
      </div>

      <!-- Status -->
      <div class="mb-8 p-4 bg-gray-800 rounded-lg">
        <div class="text-sm text-gray-400 mb-2">Status</div>
        <div class="text-2xl font-mono">{{ status }}</div>
      </div>

      <!-- Error -->
      <div v-if="error" class="mb-8 p-4 bg-red-900/50 border border-red-500 rounded-lg">
        <div class="text-sm text-red-400 mb-2">Error</div>
        <div class="font-mono">{{ error.message }}</div>
      </div>

      <!-- VAD -->
      <div class="mb-8 p-4 bg-gray-800 rounded-lg">
        <div class="text-sm text-gray-400 mb-2">Voice Activity Detection</div>
        <div class="flex items-center gap-4">
          <div
            :class="['w-4 h-4 rounded-full transition', isSpeech ? 'bg-green-500' : 'bg-gray-600']"
          ></div>
          <div class="font-mono">{{ isSpeech ? 'Speech' : 'Silence' }}</div>
          <div class="text-gray-400 font-mono">Score: {{ vadScore.toFixed(2) }}</div>
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
                :style="`width: ${Math.min(meterLevels.rms * 100, 100)}%`"
              ></div>
            </div>
            <div class="w-20 text-right font-mono text-sm">{{ meterLevels.rms.toFixed(3) }}</div>
          </div>
          <div class="flex items-center gap-4">
            <div class="w-16 text-sm text-gray-400">Peak</div>
            <div class="flex-1 bg-gray-700 h-4 rounded overflow-hidden">
              <div
                class="bg-green-500 h-full transition-all"
                :style="`width: ${Math.min(meterLevels.peak * 100, 100)}%`"
              ></div>
            </div>
            <div class="w-20 text-right font-mono text-sm">{{ meterLevels.peak.toFixed(3) }}</div>
          </div>
          <div class="flex items-center gap-4">
            <div class="w-16 text-sm text-gray-400">dB</div>
            <div class="w-20 text-right font-mono text-sm">
              {{ meterLevels.db === -Infinity ? '-∞' : meterLevels.db.toFixed(1) }}
            </div>
          </div>
        </div>
      </div>

      <!-- Segments -->
      <div class="p-4 bg-gray-800 rounded-lg">
        <div class="flex items-center justify-between mb-4">
          <div class="text-sm text-gray-400">Segments ({{ segments.length }})</div>
          <button
            @click="clearSegments"
            class="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded text-sm transition"
          >
            Clear
          </button>
        </div>
        <div v-if="segments.length === 0" class="text-gray-500 text-center py-8">
          No segments yet
        </div>
        <div v-else class="space-y-2 max-h-96 overflow-y-auto">
          <div v-for="segment in segments" :key="segment.id" class="p-3 bg-gray-700 rounded">
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
