<script setup lang="ts">
import type { Segment } from '@saraudio/core';
import { meter } from '@saraudio/meter';
import { buildAudioConstraints, segmentToAudioBuffer, type RuntimeMode } from '@saraudio/runtime-browser';
import { useAudioInputs, useMeter, useRecorder } from '@saraudio/vue';
import { vadEnergy } from '@saraudio/vad-energy';
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';

const THRESHOLD_KEY = 'saraudio:demo:thresholdDb';
const SMOOTH_KEY = 'saraudio:demo:smoothMs';
const MODE_KEY = 'saraudio:demo:captureMode';
const FALLBACK_KEY = 'saraudio:demo:allowFallback';

const thresholdDb = ref(-55);
const smoothMs = ref(30);
const mode = ref<RuntimeMode>('auto');
const allowFallback = ref(true);

onMounted(() => {
  if (typeof window === 'undefined') return;
  try {
    const savedThreshold = window.localStorage.getItem(THRESHOLD_KEY);
    if (savedThreshold) thresholdDb.value = Number(savedThreshold);
    const savedSmooth = window.localStorage.getItem(SMOOTH_KEY);
    if (savedSmooth) smoothMs.value = Number(savedSmooth);
    const savedMode = window.localStorage.getItem(MODE_KEY);
    if (savedMode === 'worklet' || savedMode === 'media-recorder' || savedMode === 'auto') {
      mode.value = savedMode;
    }
    const savedFallback = window.localStorage.getItem(FALLBACK_KEY);
    if (savedFallback) allowFallback.value = savedFallback !== '0';
  } catch {}
});

// Save to localStorage
watch(thresholdDb, (val) => {
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(THRESHOLD_KEY, String(val));
    } catch {}
  }
});
watch(smoothMs, (val) => {
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(SMOOTH_KEY, String(val));
    } catch {}
  }
});
watch(mode, (val) => {
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(MODE_KEY, val);
    } catch {}
  }
});
watch(allowFallback, (val) => {
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(FALLBACK_KEY, val ? '1' : '0');
    } catch {}
  }
});

// Audio device selection
const audioInputs = useAudioInputs({
  promptOnMount: true,
  autoSelectFirst: true,
  rememberLast: true,
});

// Build audio constraints
const audioConstraints = computed(() =>
  buildAudioConstraints({
    deviceId: audioInputs.selectedDeviceId.value,
    sampleRate: 16000,
    channelCount: 1,
  }),
);

// Recorder with dynamic configuration
const rec = useRecorder({
  stages: [vadEnergy({ thresholdDb: thresholdDb.value, smoothMs: smoothMs.value }), meter()],
  segmenter: { preRollMs: 300, hangoverMs: 500 },
  constraints: audioConstraints.value,
  mode: mode.value,
  allowFallback: allowFallback.value,
});

const meterLevels = useMeter({ pipeline: rec.pipeline });

// Recordings URLs
const cleanedUrl = ref<string | null>(null);
const fullUrl = ref<string | null>(null);
const maskedUrl = ref<string | null>(null);

// Segment playback
const audioCtxRef = ref<AudioContext | null>(null);
const sourceRef = ref<AudioBufferSourceNode | null>(null);
const playingId = ref<string | null>(null);

const stopCurrent = () => {
  const node = sourceRef.value;
  if (node) {
    try {
      node.stop();
    } catch {}
    node.disconnect();
    sourceRef.value = null;
  }
  playingId.value = null;
};

const playSegment = (s: Segment) => {
  if (!s.pcm || s.pcm.length === 0) return;
  stopCurrent();
  const ctx = audioCtxRef.value ?? new AudioContext({ sampleRate: s.sampleRate });
  audioCtxRef.value = ctx;
  const buffer = segmentToAudioBuffer(ctx, s);
  if (!buffer) return;
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.connect(ctx.destination);
  source.onended = () => {
    if (sourceRef.value === source) sourceRef.value = null;
    if (playingId.value === s.id) playingId.value = null;
  };
  sourceRef.value = source;
  playingId.value = s.id;
  source.start();
};

const handleToggleSegment = (s: Segment) => {
  if (playingId.value === s.id) {
    stopCurrent();
  } else {
    playSegment(s);
  }
};

async function handleStart() {
  await rec.start();
}

async function handleStop() {
  await rec.stop();
  meterLevels.reset();

  const cleaned = await rec.recordings.value.cleaned.getBlob();
  const full = await rec.recordings.value.full.getBlob();
  const masked = await rec.recordings.value.masked.getBlob();

  cleanedUrl.value = cleaned ? URL.createObjectURL(cleaned) : null;
  fullUrl.value = full ? URL.createObjectURL(full) : null;
  maskedUrl.value = masked ? URL.createObjectURL(masked) : null;
}

onUnmounted(() => {
  stopCurrent();
  const ctx = audioCtxRef.value;
  audioCtxRef.value = null;
  void ctx?.close();
});

const isRunning = computed(() => rec.status.value === 'running' || rec.status.value === 'acquiring');
</script>

<template>
  <div class='min-h-screen bg-gray-900 text-white p-8'>
    <div class='max-w-6xl mx-auto'>
      <header class='mb-8'>
        <h1 class='text-4xl font-bold mb-4'>SARAUDIO · Nuxt Demo</h1>
        <p class='text-gray-400'>
          Full-featured audio recorder with VAD, device selection, and multiple export formats
        </p>
      </header>

      <!-- Device & Configuration -->
      <section class='mb-8 p-6 bg-gray-800 rounded-lg space-y-4'>
        <h2 class='text-xl font-semibold mb-4'>Configuration</h2>

        <!-- Device Selection -->
        <div class='flex gap-4 items-end'>
          <div class='flex-1'>
            <label class='block text-sm text-gray-400 mb-2'>Input Device</label>
            <select
              v-model='audioInputs.selectedDeviceId.value'
              :disabled='audioInputs.enumerating.value || isRunning'
              class='w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:opacity-50'
            >
              <option
                v-for='device in audioInputs.devices.value'
                :key='device.deviceId'
                :value='device.deviceId'
              >
                {{ device.label || `Microphone ${device.deviceId.slice(0, 6)}` }}
              </option>
            </select>
          </div>
          <button
            type='button'
            @click='audioInputs.refresh'
            :disabled='audioInputs.enumerating.value || isRunning'
            class='px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg transition'
          >
            {{ audioInputs.enumerating.value ? 'Scanning...' : 'Refresh' }}
          </button>
        </div>

        <!-- VAD Configuration -->
        <div class='grid grid-cols-2 gap-4'>
          <div>
            <label class='block text-sm text-gray-400 mb-2'>
              Energy Threshold: {{ thresholdDb }} dB
            </label>
            <input
              type='range'
              min='-90'
              max='-5'
              step='1'
              v-model.number='thresholdDb'
              class='w-full'
            />
          </div>
          <div>
            <label class='block text-sm text-gray-400 mb-2'>Smoothing: {{ smoothMs }} ms</label>
            <input type='range' min='5' max='200' step='5' v-model.number='smoothMs' class='w-full' />
          </div>
        </div>

        <!-- Capture Mode -->
        <div class='grid grid-cols-2 gap-4'>
          <div>
            <label class='block text-sm text-gray-400 mb-2'>Capture Mode</label>
            <select
              v-model='mode'
              :disabled='isRunning'
              class='w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:opacity-50'
            >
              <option value='auto'>Auto</option>
              <option value='worklet'>Worklet</option>
              <option value='media-recorder'>Media Recorder</option>
            </select>
          </div>
          <div class='flex items-end'>
            <label class='flex items-center gap-2 cursor-pointer'>
              <input type='checkbox' v-model='allowFallback' :disabled='isRunning' class='w-4 h-4' />
              <span class='text-sm text-gray-400'>Allow fallback</span>
            </label>
          </div>
        </div>
      </section>

      <!-- Controls -->
      <div class='flex gap-4 mb-8'>
        <button
          type='button'
          @click='handleStart'
          :disabled='isRunning || rec.status.value === "stopping"'
          class='px-6 py-3 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg font-medium transition'
        >
          {{ rec.status.value === 'acquiring' ? 'Acquiring...' : 'Start Microphone' }}
        </button>
        <button
          type='button'
          @click='handleStop'
          :disabled='!isRunning'
          class='px-6 py-3 bg-red-600 hover:bg-red-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg font-medium transition'
        >
          Stop Microphone
        </button>
        <button
          type='button'
          @click='rec.clearSegments'
          :disabled='rec.segments.value.length === 0'
          class='px-6 py-3 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg font-medium transition'
        >
          Clear Segments
        </button>
      </div>

      <!-- Status & Errors -->
      <div class='mb-8 space-y-2'>
        <div
          class='px-4 py-2 rounded-lg'
          :class='{
            "bg-green-900/50 border border-green-500": rec.status.value === "running",
            "bg-blue-900/50 border border-blue-500": rec.status.value === "acquiring",
            "bg-gray-800 border border-gray-600": rec.status.value === "idle",
          }'
        >
          <span class='text-sm text-gray-400'>Status:</span>
          <span class='ml-2 font-mono'>{{ rec.status.value }}</span>
        </div>
        <div
          v-if='audioInputs.error.value'
          class='px-4 py-2 bg-red-900/50 border border-red-500 rounded-lg'
        >
          <span class='text-sm text-red-400'>Device Error:</span>
          <span class='ml-2'>{{ audioInputs.error.value }}</span>
        </div>
        <div
          v-if='rec.error.value'
          class='px-4 py-2 bg-red-900/50 border border-red-500 rounded-lg'
        >
          <span class='text-sm text-red-400'>Error:</span>
          <span class='ml-2'>{{ rec.error.value.message }}</span>
        </div>
      </div>

      <!-- VAD & Meter -->
      <div class='grid grid-cols-2 gap-8 mb-8'>
        <!-- VAD -->
        <div class='p-6 bg-gray-800 rounded-lg'>
          <h2 class='text-xl font-semibold mb-4'>Voice Activity</h2>
          <div class='flex items-center gap-4 mb-4'>
            <div
              :class="[
                'w-6 h-6 rounded-full transition-all',
                rec.vad.value?.speech ? 'bg-green-500' : 'bg-gray-600',
              ]"
            />
            <div class='font-mono text-lg'>
              {{ rec.vad.value?.speech ? 'Speech' : 'Silence' }}
            </div>
          </div>
          <div class='text-sm text-gray-400'>
            Score: {{ rec.vad.value?.score.toFixed(2) ?? '0.00' }}
          </div>
        </div>

        <!-- Meter -->
        <div class='p-6 bg-gray-800 rounded-lg'>
          <h2 class='text-xl font-semibold mb-4'>Audio Levels</h2>
          <div class='space-y-3'>
            <div>
              <div class='flex justify-between text-sm text-gray-400 mb-1'>
                <span>RMS</span>
                <span>{{ meterLevels.rms.value.toFixed(3) }}</span>
              </div>
              <div class='w-full bg-gray-700 h-3 rounded overflow-hidden'>
                <div
                  class='bg-blue-500 h-full transition-all'
                  :style='`width: ${Math.min(meterLevels.rms.value * 100, 100)}%`'
                />
              </div>
            </div>
            <div>
              <div class='flex justify-between text-sm text-gray-400 mb-1'>
                <span>Peak</span>
                <span>{{ meterLevels.peak.value.toFixed(3) }}</span>
              </div>
              <div class='w-full bg-gray-700 h-3 rounded overflow-hidden'>
                <div
                  class='bg-green-500 h-full transition-all'
                  :style='`width: ${Math.min(meterLevels.peak.value * 100, 100)}%`'
                />
              </div>
            </div>
            <div class='flex justify-between text-sm text-gray-400'>
              <span>dB</span>
              <span>{{
                meterLevels.db.value === -Infinity ? '-∞' : meterLevels.db.value.toFixed(1)
              }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Segments -->
      <section class='mb-8 p-6 bg-gray-800 rounded-lg'>
        <h2 class='text-xl font-semibold mb-4'>
          Captured Segments ({{ rec.segments.value.length }})
        </h2>
        <div v-if='rec.segments.value.length === 0' class='text-gray-500 text-center py-8'>
          Talk into the microphone to capture segments
        </div>
        <div v-else class='space-y-2 max-h-96 overflow-y-auto'>
          <div
            v-for='segment in rec.segments.value'
            :key='segment.id'
            class='p-4 bg-gray-700 rounded-lg flex items-center gap-4'
          >
            <button
              type='button'
              @click='handleToggleSegment(segment)'
              class='w-10 h-10 flex items-center justify-center bg-gray-600 hover:bg-gray-500 rounded-lg transition'
              :title='playingId === segment.id ? "Stop segment" : "Play segment"'
            >
              {{ playingId === segment.id ? '■' : '▶' }}
            </button>
            <div class='flex-1'>
              <div class='flex items-center justify-between mb-1'>
                <div class='font-mono text-xs text-gray-400'>
                  #{{ segment.id.slice(0, 8).toUpperCase() }}
                </div>
                <div class='text-xs text-gray-400'>
                  {{ (segment.durationMs / 1000).toFixed(2) }}s
                </div>
              </div>
              <div class='text-sm text-gray-300'>
                {{ new Date(segment.startMs).toLocaleTimeString() }} →
                {{ new Date(segment.endMs).toLocaleTimeString() }}
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- Recordings -->
      <section class='p-6 bg-gray-800 rounded-lg'>
        <h2 class='text-xl font-semibold mb-4'>Recordings</h2>
        <div class='space-y-4'>
          <div class='p-4 bg-gray-700 rounded-lg'>
            <div class='text-sm font-medium mb-2'>Cleaned (speech only)</div>
            <audio v-if='cleanedUrl' controls :src='cleanedUrl' class='w-full' />
            <div v-else class='text-sm text-gray-500'>No recording yet</div>
          </div>
          <div class='p-4 bg-gray-700 rounded-lg'>
            <div class='text-sm font-medium mb-2'>Full (entire session)</div>
            <audio v-if='fullUrl' controls :src='fullUrl' class='w-full' />
            <div v-else class='text-sm text-gray-500'>No recording yet</div>
          </div>
          <div class='p-4 bg-gray-700 rounded-lg'>
            <div class='text-sm font-medium mb-2'>Masked (silence as zeros)</div>
            <audio v-if='maskedUrl' controls :src='maskedUrl' class='w-full' />
            <div v-else class='text-sm text-gray-500'>No recording yet</div>
          </div>
        </div>
      </section>

      <footer class='mt-8 text-sm text-gray-500 text-center'>
        <p>
          Microphone requires HTTPS (or localhost) and user permission. Adjust thresholds to tune
          sensitivity.
        </p>
      </footer>
    </div>
  </div>
</template>
