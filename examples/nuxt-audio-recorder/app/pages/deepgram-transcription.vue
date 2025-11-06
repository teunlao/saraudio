<script setup lang="ts">
import type { TranscriptResult } from '@saraudio/core';
import {
  DEEPGRAM_MODEL_DEFINITIONS,
  deepgram,
  isLanguageSupported,
  type DeepgramLanguage,
  type DeepgramModelId,
} from '@saraudio/deepgram';
import { meter } from '@saraudio/meter';
import type { RuntimeMode } from '@saraudio/runtime-browser';
import { vadEnergy } from '@saraudio/vad-energy';
import { useAudioInputs, useMeter, useRecorder, useTranscription } from '@saraudio/vue';
import { computed, onUnmounted, ref, watch } from 'vue';
import { useRuntimeConfig } from '#app';

const MODE_KEY = 'saraudio:demo:transcription:mode';
const THRESHOLD_KEY = 'saraudio:demo:transcription:threshold';
const SMOOTH_KEY = 'saraudio:demo:transcription:smooth';
const FALLBACK_KEY = 'saraudio:demo:transcription:fallback';

const config = useRuntimeConfig();

const selectedModel = ref<DeepgramModelId>('nova-3');
const selectedLanguage = ref<DeepgramLanguage>('en-US');

const thresholdDb = ref(-55);
const smoothMs = ref(25);
const mode = ref<RuntimeMode>('auto');
const allowFallback = ref(true);

if (typeof window !== 'undefined') {
  try {
    const savedMode = window.localStorage.getItem(MODE_KEY);
    if (savedMode === 'auto' || savedMode === 'worklet' || savedMode === 'media-recorder') {
      mode.value = savedMode;
    }
    const savedThreshold = window.localStorage.getItem(THRESHOLD_KEY);
    if (savedThreshold) thresholdDb.value = Number(savedThreshold);
    const savedSmooth = window.localStorage.getItem(SMOOTH_KEY);
    if (savedSmooth) smoothMs.value = Number(savedSmooth);
    const savedFallback = window.localStorage.getItem(FALLBACK_KEY);
    if (savedFallback) allowFallback.value = savedFallback !== '0';
  } catch {}
}

watch(mode, (value) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(MODE_KEY, value);
  } catch {}
});
watch(thresholdDb, (value) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(THRESHOLD_KEY, String(value));
  } catch {}
});
watch(smoothMs, (value) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(SMOOTH_KEY, String(value));
  } catch {}
});
watch(allowFallback, (value) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(FALLBACK_KEY, value ? '1' : '0');
  } catch {}
});

const audioInputs = useAudioInputs({ promptOnMount: true, autoSelectFirst: true, rememberLast: true });

const recorder = useRecorder({
  stages: computed(() => [vadEnergy({ thresholdDb: thresholdDb.value, smoothMs: smoothMs.value }), meter()]),
  segmenter: { preRollMs: 200, hangoverMs: 350 },
  source: computed(() => ({ microphone: { deviceId: audioInputs.selectedDeviceId.value } })),
  format: { sampleRate: 16000, channels: 1 },
  mode,
  allowFallback,
});

const meterLevels = useMeter({ pipeline: recorder.pipeline });
const devicesList = computed(() => audioInputs.devices.value);
const vadState = computed(() => recorder.vad.value);

const modelEntries = computed(() =>
  (Object.keys(DEEPGRAM_MODEL_DEFINITIONS) as DeepgramModelId[]).map((id) => ({
    id,
    label: DEEPGRAM_MODEL_DEFINITIONS[id].label,
  })),
);

const availableLanguages = computed(() => [...DEEPGRAM_MODEL_DEFINITIONS[selectedModel.value].languages]);

watch(selectedModel, (model) => {
  if (!isLanguageSupported(model, selectedLanguage.value)) {
    const fallback = DEEPGRAM_MODEL_DEFINITIONS[model].languages[0] as DeepgramLanguage;
    selectedLanguage.value = fallback;
  }
});

const ensureLanguage = (model: DeepgramModelId, language: DeepgramLanguage): DeepgramLanguage => {
  if (isLanguageSupported(model, language)) return language;
  return DEEPGRAM_MODEL_DEFINITIONS[model].languages[0] as DeepgramLanguage;
};

const events = ref<string[]>([]);
const latestResults = ref<TranscriptResult[]>([]);
const MAX_EVENTS = 60;
const MAX_RESULTS = 20;

const pushEvent = (message: string) => {
  events.value.unshift(`${new Date().toLocaleTimeString()} ${message}`);
  if (events.value.length > MAX_EVENTS) events.value.length = MAX_EVENTS;
};

const resolveToken = async (): Promise<string> => {
  const key = config.public.deepgramApiKey;
  if (!key || typeof key !== 'string' || key.trim().length === 0) {
    throw new Error('Missing NUXT_PUBLIC_DEEPGRAM_API_KEY for Deepgram demo');
  }
  return key.trim();
};

const buildProviderOptions = (model: DeepgramModelId, language: DeepgramLanguage) => ({
  model,
  language,
  interimResults: true,
  punctuate: true,
  tokenProvider: resolveToken,
});

const synchroniseSelection = (model: DeepgramModelId, language: DeepgramLanguage) => {
  const effectiveLanguage = ensureLanguage(model, language);
  if (effectiveLanguage !== language) {
    selectedLanguage.value = effectiveLanguage;
  }
  return { model, language: effectiveLanguage } as const;
};

let currentSelection = synchroniseSelection(selectedModel.value, selectedLanguage.value);
let currentOptions = buildProviderOptions(currentSelection.model, currentSelection.language);

const transcription = useTranscription({
  provider: deepgram(currentOptions),
  recorder,
  preconnectBufferMs: 120,
  flushOnSegmentEnd: true,
  connection: {
    ws: {
      retry: {
        enabled: true,
        maxAttempts: 5,
        baseDelayMs: 300,
        factor: 2,
        maxDelayMs: 5000,
        jitterRatio: 0.2,
      },
    },
  },
  onTranscript: (result) => {
    latestResults.value.unshift(result);
    if (latestResults.value.length > MAX_RESULTS) latestResults.value.length = MAX_RESULTS;
    pushEvent(`[transcript] ${result.text}`);
  },
  onError: (err: Error) => {
    pushEvent(`[error] ${err.message}`);
  },
});

watch(
  () => transcription.status.value,
  (next, prev) => {
    if (!prev || next === prev) return;
    pushEvent(`[status] ${prev} → ${next}`);
  },
);

let configInitialized = false;
watch([selectedModel, selectedLanguage], ([model, lang]) => {
  const nextSelection = synchroniseSelection(model, lang);
  if (!configInitialized) {
    configInitialized = true;
    currentSelection = nextSelection;
    pushEvent(`[config] provider set to model=${nextSelection.model}, language=${nextSelection.language}`);
    return;
  }
  if (nextSelection.model === currentSelection.model && nextSelection.language === currentSelection.language) {
    return;
  }
  currentSelection = nextSelection;
  currentOptions = buildProviderOptions(nextSelection.model, nextSelection.language);
  void (async () => {
    try {
      await transcription.provider.update(currentOptions);
      transcription.clear();
      pushEvent(
        `[config] provider updated: model=${nextSelection.model}, language=${nextSelection.language}`,
      );
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      pushEvent(`[config-error] ${error.message}`);
    }
  })();
});

const transcriptText = computed(() => transcription.transcript.value.trim());
const partialText = computed(() => transcription.partial.value);
const controllerStatus = computed(() => transcription.status.value);
const isConnected = computed(() => transcription.isConnected.value);
const recorderRunning = computed(() => recorder.status.value === 'running' || recorder.status.value === 'acquiring');
const missingApiKey = computed(() => {
  const key = config.public.deepgramApiKey;
  return !key || typeof key !== 'string' || key.trim().length === 0;
});

const start = async () => {
  try {
    await transcription.connect();
    await recorder.start();
    pushEvent('[action] recording + transcription started');
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    pushEvent(`[action-error] ${error.message}`);
  }
};

const stop = async () => {
  try {
    await recorder.stop();
  } catch {}
  meterLevels.reset();
  await transcription.disconnect();
  pushEvent('[action] recording stopped, transcription disconnected');
};

const forceEndpoint = async () => {
  await transcription.forceEndpoint();
  pushEvent('[action] force endpoint');
};

onUnmounted(() => {
  void stop();
});
</script>

<template>
  <div class="min-h-screen bg-gray-900 text-white p-8">
    <div class="max-w-6xl mx-auto space-y-8">
      <header class="space-y-2">
        <h1 class="text-3xl font-bold">Deepgram · useTranscription Demo</h1>
        <p class="text-gray-400">
          Real-time transcription using the SARAUDIO Vue hook, Deepgram provider, and the shared recorder pipeline.
        </p>
        <div v-if="missingApiKey" class="p-4 rounded bg-red-900/40 border border-red-700 text-sm">
          <p class="font-semibold">Missing API key</p>
          <p>Set <code>NUXT_PUBLIC_DEEPGRAM_API_KEY</code> in <code>.env</code> before using this demo.</p>
        </div>
      </header>

      <section class="p-6 bg-gray-800 rounded space-y-4">
        <div class="grid sm:grid-cols-2 gap-4">
          <div>
            <label class="block text-sm text-gray-400 mb-1">Input Device</label>
            <select
              v-model="audioInputs.selectedDeviceId.value"
              :disabled="audioInputs.enumerating.value || recorderRunning"
              class="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
            >
              <option v-for="device in audioInputs.devices.value" :key="device.deviceId" :value="device.deviceId">
                {{ device.label || `Mic ${device.deviceId.slice(0, 6)}` }}
              </option>
            </select>
          </div>
          <button
            type="button"
            @click="audioInputs.refresh"
            :disabled="audioInputs.enumerating.value || recorderRunning"
            class="px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg transition"
          >
            {{ audioInputs.enumerating.value ? 'Scanning…' : 'Refresh' }}
          </button>
        </div>

        <div class="grid sm:grid-cols-3 gap-4">
          <div>
            <label class="block text-sm text-gray-400 mb-1">Model</label>
            <select
              v-model="selectedModel"
              class="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded focus:ring-2 focus:ring-blue-500"
            >
              <option v-for="entry in modelEntries" :key="entry.id" :value="entry.id">
                {{ entry.label }}
              </option>
            </select>
          </div>
          <div>
            <label class="block text-sm text-gray-400 mb-1">Language</label>
            <select
              v-model="selectedLanguage"
              class="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded focus:ring-2 focus:ring-blue-500"
            >
              <option v-for="lang in availableLanguages" :key="lang" :value="lang">{{ lang }}</option>
            </select>
          </div>
          <div>
            <label class="block text-sm text-gray-400 mb-1">Capture Mode</label>
            <select
              v-model="mode"
              :disabled="recorderRunning"
              class="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
            >
              <option value="auto">Auto</option>
              <option value="worklet">AudioWorklet</option>
              <option value="media-recorder">MediaRecorder</option>
            </select>
          </div>
        </div>

        <div class="grid sm:grid-cols-2 gap-4">
          <div>
            <label class="block text-sm text-gray-400 mb-1">Threshold (dB): {{ thresholdDb }}</label>
            <input type="range" min="-90" max="-5" step="1" v-model.number="thresholdDb" class="w-full" />
          </div>
          <div>
            <label class="block text-sm text-gray-400 mb-1">Smoothing (ms): {{ smoothMs }}</label>
            <input type="range" min="5" max="200" step="5" v-model.number="smoothMs" class="w-full" />
          </div>
        </div>

        <div class="flex items-center gap-4">
          <button
            @click="start"
            :disabled="recorderRunning || missingApiKey"
            class="px-4 py-2 bg-green-600 hover:bg-green-500 rounded disabled:opacity-40 disabled:cursor-not-allowed transition"
          >
            Start
          </button>
          <button
            @click="stop"
            :disabled="!recorderRunning && !isConnected"
            class="px-4 py-2 bg-red-600 hover:bg-red-500 rounded disabled:opacity-40 disabled:cursor-not-allowed transition"
          >
            Stop
          </button>
          <button
            @click="forceEndpoint"
            :disabled="!isConnected"
            class="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded disabled:opacity-40 disabled:cursor-not-allowed transition"
          >
            Force Endpoint
          </button>
          <span class="px-3 py-1 bg-gray-700 rounded text-sm">
            Status: {{ controllerStatus }} · Connected: {{ isConnected ? 'yes' : 'no' }}
          </span>
        </div>
      </section>

      <section class="grid lg:grid-cols-3 gap-6">
        <div class="p-4 bg-gray-800 rounded space-y-2">
          <h2 class="text-lg font-semibold">VAD</h2>
          <div class="flex items-center gap-3">
            <div :class="['w-4 h-4 rounded-full', recorder.vad.value?.speech ? 'bg-green-500' : 'bg-gray-600']"></div>
            <span class="font-mono">{{ recorder.vad.value?.score.toFixed(2) ?? '0.00' }}</span>
          </div>
        </div>
        <div class="p-4 bg-gray-800 rounded space-y-2">
          <h2 class="text-lg font-semibold">RMS</h2>
          <div class="h-2 bg-gray-700 rounded overflow-hidden">
            <div class="h-full bg-blue-500 transition-all" :style="`width:${Math.min(meterLevels.rms.value * 100, 100)}%`" />
          </div>
          <div class="text-sm text-gray-400">
            {{ meterLevels.db.value === -Infinity ? '-∞' : meterLevels.db.value.toFixed(1) }} dB
          </div>
        </div>
        <div class="p-4 bg-gray-800 rounded space-y-2">
          <h2 class="text-lg font-semibold">Transport</h2>
          <div class="font-mono text-sm">{{ transcription.transport }}</div>
          <div class="text-xs text-gray-400">Retry/backoff enabled with bounded queue.</div>
        </div>
      </section>

      <section class="grid lg:grid-cols-2 gap-6">
        <div class="p-6 bg-gray-800 rounded space-y-4">
          <div class="flex justify-between items-center">
            <h2 class="text-lg font-semibold">Transcript</h2>
            <button
              class="px-3 py-1 text-sm bg-gray-700 hover:bg-gray-600 rounded disabled:opacity-40 disabled:cursor-not-allowed transition"
            @click="transcription.clear()"
              :disabled="!transcriptText && !partialText"
            >
              Clear
            </button>
          </div>
          <div class="min-h-48 max-h-72 overflow-y-auto bg-gray-900 border border-gray-700 rounded p-4 space-y-4">
            <div v-if="!transcriptText && !partialText" class="text-sm text-gray-500 text-center py-6">
              Waiting for speech…
            </div>
            <div v-else>
              <p v-if="transcriptText" class="text-gray-100 whitespace-pre-wrap leading-relaxed">
                {{ transcriptText }}
              </p>
              <p v-if="partialText" class="text-gray-400 italic whitespace-pre-wrap leading-relaxed">
                {{ partialText }}
              </p>
            </div>
          </div>
        </div>

        <div class="p-6 bg-gray-800 rounded space-y-4">
          <div class="flex justify-between items-center">
            <h2 class="text-lg font-semibold">Recent results</h2>
            <span class="text-xs text-gray-400">{{ latestResults.length }} shown</span>
          </div>
          <div class="max-h-72 overflow-y-auto space-y-3">
            <div
              v-for="(result, index) in latestResults"
              :key="index"
              class="bg-gray-900 border border-gray-700 rounded p-3 space-y-1"
            >
              <div class="text-sm text-gray-400">
                {{ result.language ?? '-' }} · confidence:
                {{ result.confidence !== undefined ? result.confidence.toFixed(2) : '—' }}
              </div>
              <div class="text-gray-100 whitespace-pre-wrap leading-snug">{{ result.text }}</div>
            </div>
          </div>
        </div>
      </section>

      <section class="p-6 bg-gray-800 rounded space-y-3">
        <div class="flex justify-between items-center">
          <h2 class="text-lg font-semibold">Event log</h2>
          <button
            class="px-3 py-1 text-sm bg-gray-700 hover:bg-gray-600 rounded disabled:opacity-40 disabled:cursor-not-allowed transition"
            :disabled="events.length === 0"
            @click="events = []"
          >
            Clear Log
          </button>
        </div>
        <div class="max-h-64 overflow-y-auto font-mono text-xs bg-gray-900 border border-gray-700 rounded p-3 space-y-1">
          <p v-if="events.length === 0" class="text-gray-500 text-center py-4">No events yet…</p>
          <p v-for="(entry, index) in events" :key="index" class="text-gray-300 whitespace-pre-wrap">
            {{ entry }}
          </p>
        </div>
      </section>
    </div>
  </div>
</template>
