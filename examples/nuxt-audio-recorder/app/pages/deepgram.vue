<script setup lang="ts">
import type { Frame } from '@saraudio/core';
import { meter } from '@saraudio/meter';
import type { RecorderSourceOptions, RuntimeMode } from '@saraudio/runtime-browser';
import { vadEnergy } from '@saraudio/vad-energy';
import { useAudioInputs, useMeter, useRecorder } from '@saraudio/vue';
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useDeepgramRealtime } from '../../composables/useDeepgramRealtime';

const mode = ref<RuntimeMode>('auto');
const allowFallback = ref(true);
const thresholdDb = ref(-50);
const smoothMs = ref(30);

const audioInputs = useAudioInputs({ promptOnMount: true, autoSelectFirst: true, rememberLast: true });

const rec = useRecorder({
  stages: computed(() => [vadEnergy({ thresholdDb: thresholdDb.value, smoothMs: smoothMs.value }), meter()]),
  segmenter: { preRollMs: 120, hangoverMs: 250 },
  source: {
    microphone: {
      deviceId: audioInputs.selectedDeviceId.value,
    },
  },
  mode,
  allowFallback,
});

const levels = useMeter({ pipeline: rec.pipeline });

const dg = useDeepgramRealtime();
let unsubscribe: { unsubscribe(): void } | null = null;

// Derived, typed values for template (avoid any and ref property access warnings)
const wsInfo = computed(() => {
  const c = dg.lastClose.value;
  return c ? { code: c.code, reason: c.reason, clean: c.wasClean } : null;
});
const wsLog = computed(() => {
  const lines = dg.log.value;
  return Array.isArray(lines) ? lines.join('\n') : '';
});

async function start() {
  dg.connect();
  // Subscribe to raw frames and forward to Deepgram
  unsubscribe =
    rec.recorder.value?.subscribeRawFrames((frame: Frame) => {
      const int16 = frame.pcm instanceof Int16Array ? frame.pcm : new Int16Array(frame.pcm.length);
      if (!(frame.pcm instanceof Int16Array)) {
        // simple float -> int16 conversion
        const src = frame.pcm;
        for (let i = 0; i < src.length; i += 1) {
          const s = Math.max(-1, Math.min(1, src[i] ?? 0));
          int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
        }
      }
      dg.sendPcm16(int16, frame.sampleRate);
    }) ?? null;
  await rec.start();
}

async function stop() {
  await rec.stop();
  levels.reset();
  unsubscribe?.unsubscribe();
  unsubscribe = null;
  dg.close();
}

const isRunning = computed(() => rec.status.value === 'running' || rec.status.value === 'acquiring');

onUnmounted(() => {
  void stop();
});
</script>

<template>
  <div class="min-h-screen bg-gray-900 text-white p-8">
    <div class="max-w-5xl mx-auto space-y-8">
      <header>
        <h1 class="text-3xl font-bold">Deepgram Realtime · Nuxt + SARAUDIO</h1>
        <p class="text-gray-400 mt-2">Live transcription using AudioWorklet/MediaRecorder pipeline</p>
      </header>

      <section class="p-6 bg-gray-800 rounded-lg space-y-4">
        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="block text-sm text-gray-400 mb-2">Input Device</label>
            <select v-model="audioInputs.selectedDeviceId.value" class="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg">
              <option v-for="d in audioInputs.devices.value" :key="d.deviceId" :value="d.deviceId">{{ d.label || `Mic ${d.deviceId.slice(0,6)}` }}</option>
            </select>
          </div>
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-sm text-gray-400 mb-2">Threshold (dB): {{ thresholdDb }}</label>
              <input type="range" min="-90" max="-5" step="1" v-model.number="thresholdDb" class="w-full" />
            </div>
            <div>
              <label class="block text-sm text-gray-400 mb-2">Smoothing (ms): {{ smoothMs }}</label>
              <input type="range" min="5" max="200" step="5" v-model.number="smoothMs" class="w-full" />
            </div>
          </div>
        </div>

        <div class="flex gap-4 items-center">
          <button @click="start" :disabled="isRunning" class="px-4 py-2 bg-green-600 rounded-lg disabled:opacity-50">Start</button>
          <button @click="stop" :disabled="!isRunning" class="px-4 py-2 bg-red-600 rounded-lg disabled:opacity-50">Stop</button>
          <div class="px-3 py-2 bg-gray-700 rounded">
            WS: <span class="font-mono">{{ dg.status }}</span>
            <span v-if="wsInfo" class="ml-2 text-xs text-gray-400">(code {{ wsInfo!.code }}, {{ wsInfo!.reason || '-' }})</span>
            <template v-if="dg.error"> <span class="ml-2 text-xs text-red-400">{{ dg.error }}</span> </template>
          </div>
        </div>
      </section>

      <section class="grid grid-cols-3 gap-6">
        <div class="p-4 bg-gray-800 rounded">
          <div class="text-sm text-gray-400">VAD</div>
          <div class="mt-2 flex items-center gap-3">
            <div :class="['w-4 h-4 rounded-full', rec.vad.value?.speech ? 'bg-green-500' : 'bg-gray-600']"></div>
            <div class="font-mono">{{ rec.vad.value?.score.toFixed(2) ?? '0.00' }}</div>
          </div>
        </div>
        <div class="p-4 bg-gray-800 rounded">
          <div class="text-sm text-gray-400">RMS</div>
          <div class="mt-2 h-2 bg-gray-700 rounded overflow-hidden">
            <div class="h-full bg-blue-500" :style="`width:${Math.min(levels.rms.value*100,100)}%`"></div>
          </div>
          <div class="mt-2 text-sm text-gray-400">dB: {{ levels.db.value === -Infinity ? '-∞' : levels.db.value.toFixed(1) }}</div>
        </div>
        <div class="p-4 bg-gray-800 rounded">
          <div class="text-sm text-gray-400">Mode</div>
          <div class="mt-2 font-mono">{{ mode }}</div>
        </div>
      </section>

      <section class="p-6 bg-gray-800 rounded-lg">
        <div class="flex justify-between items-center mb-4">
          <h2 class="text-lg font-semibold">Transcript</h2>
          <button
            @click="dg.clear"
            :disabled="!dg.transcript.value && !dg.partial.value"
            class="px-3 py-1 text-sm bg-gray-700 hover:bg-gray-600 rounded disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Clear
          </button>
        </div>
        <div class="min-h-48 max-h-96 overflow-y-auto p-4 bg-gray-900 rounded border border-gray-700">
          <div v-if="!dg.transcript.value && !dg.partial.value" class="text-gray-500 text-center py-8">
            Start recording to see live transcription...
          </div>
          <div v-else class="space-y-2 whitespace-pre-wrap">
            <p v-if="dg.transcript.value" class="text-gray-200 leading-relaxed">{{ dg.transcript.value }}</p>
            <p v-if="dg.partial.value" class="text-gray-400 italic">{{ dg.partial.value }}</p>
          </div>
        </div>
      </section>

      <section class="p-4 bg-gray-800 rounded">
        <h2 class="text-lg font-semibold mb-2">WS Debug</h2>
        <pre class="text-xs text-gray-300 whitespace-pre-wrap">{{ wsLog }}</pre>
      </section>
    </div>
  </div>
</template>
