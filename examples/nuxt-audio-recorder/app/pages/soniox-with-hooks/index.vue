<script setup lang="ts">
import type { TranscriptResult } from '@saraudio/core';
import { soniox } from '@saraudio/soniox';
import { meter } from '@saraudio/meter';
import type { RuntimeMode } from '@saraudio/runtime-browser';
import { vadEnergy } from '@saraudio/vad-energy';
import { useAudioInputs, useMeter, useRecorder, useTranscription } from '@saraudio/vue';
import { computed, onUnmounted, ref, watch } from 'vue';
import { useRuntimeConfig } from '#app';
import { useLocalStorageSettings } from '../../composables/useLocalStorageSettings';
import PageShell from '../../components/demo/PageShell.vue';
import SectionCard from '../../components/demo/SectionCard.vue';
import DeepgramDeviceSelect from '../../components/deepgram/DeviceSelect.vue';
import DeepgramProviderControls from '../../components/deepgram/ProviderControls.vue';
import DeepgramVadControls from '../../components/deepgram/VadControls.vue';
import DeepgramRecorderActions from '../../components/deepgram/RecorderActions.vue';
import DeepgramStatsRow from '../../components/deepgram/StatsRow.vue';
import DeepgramTranscriptPanel from '../../components/deepgram/TranscriptPanel.vue';
import DeepgramRecentResults from '../../components/deepgram/RecentResults.vue';
import DeepgramEventLog from '../../components/deepgram/EventLog.vue';

const config = useRuntimeConfig();

// Soniox realtime models (examples)
const SONIOX_MODELS = [
  { id: 'stt-rt-v3', label: 'stt-rt-v3' },
  { id: 'stt-rt-preview', label: 'stt-rt-preview' },
] as const;

// Language hints (two-letter codes recommended by Soniox; extend as needed)
const SONIOX_LANGS = ['en', 'es', 'de', 'fr', 'it', 'pt', 'ru', 'ja', 'ko', 'zh'] as const;

const selectedModel = ref<typeof SONIOX_MODELS[number]['id']>('stt-rt-v3');
const selectedLanguage = ref<(typeof SONIOX_LANGS)[number]>('en');

const thresholdDb = ref(-55);
const smoothMs = ref(25);
const mode = ref<RuntimeMode>('auto');
const allowFallback = ref(true);
const transportMode = ref<'websocket' | 'http'>('websocket');

useLocalStorageSettings({ mode, thresholdDb, smoothMs, allowFallback, transportMode });

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
const devicesList = computed(() => audioInputs.devices.value ?? []);
const selectedDeviceId = computed({
  get: () => audioInputs.selectedDeviceId.value,
  set: (value: string) => {
    audioInputs.selectedDeviceId.value = value;
  },
});
const vadState = computed(() => recorder.vad.value);

const modelEntries = computed(() => SONIOX_MODELS);
const availableLanguages = computed(() => [...SONIOX_LANGS]);

const events = ref<string[]>([]);
const latestResults = ref<TranscriptResult[]>([]);
const MAX_EVENTS = 60;
const MAX_RESULTS = 20;

const pushEvent = (message: string) => {
  events.value.unshift(`${new Date().toLocaleTimeString()} ${message}`);
  if (events.value.length > MAX_EVENTS) events.value.length = MAX_EVENTS;
};

const resolveToken = async (): Promise<string> => {
  const key = config.public.sonioxApiKey;
  if (!key || typeof key !== 'string' || key.trim().length === 0) {
    throw new Error('Missing NUXT_PUBLIC_SONIOX_API_KEY for Soniox demo');
  }
  return key.trim();
};

const provider = computed(() =>
  soniox({
    model: selectedModel.value,
    languageHints: [selectedLanguage.value],
    auth: { getToken: resolveToken },
  }),
);

const transcription = useTranscription({
  provider,
  transport: transportMode,
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
      },
    },
    http: {
      chunking: {
        intervalMs: 2500,
        minDurationMs: 1000,
        overlapMs: 300,
        maxInFlight: 1,
        timeoutMs: 15000,
      },
    },
  },
  onTranscript: (result) => {
    latestResults.value.unshift(result);
    if (latestResults.value.length > MAX_RESULTS) latestResults.value.length = MAX_RESULTS;
    pushEvent(`[transcript] ${result.text}`);
  },
  onError: (err) => {
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

let lastSelection: { model: string; language: string; transport: 'websocket' | 'http' } | null = null;
watch([selectedModel, selectedLanguage, transportMode], ([model, lang, transport]) => {
  if (!lastSelection) {
    lastSelection = { model, language: lang, transport };
    pushEvent(`[config] provider set to model=${model}, language=${lang}, transport=${transport}`);
    return;
  }
  if (lastSelection.model === model && lastSelection.language === lang && lastSelection.transport === transport) {
    return;
  }
  const previousTransport = lastSelection.transport;
  lastSelection = { model, language: lang, transport };
  pushEvent(`[config] provider updated: model=${model}, language=${lang}, transport=${transport}`);
  if (transport !== previousTransport) {
    latestResults.value.length = 0;
    transcription.clear();
  }
});

const transcriptText = computed(() => transcription.transcript.value.trim());
const partialText = computed(() => transcription.partial.value);
const controllerStatus = computed(() => transcription.status.value);
const isConnected = computed(() => transcription.isConnected.value);
const recorderRunning = computed(() => recorder.status.value === 'running' || recorder.status.value === 'acquiring');
const missingApiKey = computed(() => {
  const key = config.public.sonioxApiKey;
  return !key || typeof key !== 'string' || key.trim().length === 0;
});
const isHttpMode = computed(() => transportMode.value === 'http');

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

const clearTranscript = () => {
  transcription.clear();
};

const clearEvents = () => {
  events.value = [];
};

onUnmounted(() => {
  void stop();
});
</script>

<template>
  <PageShell
    title="Soniox · useTranscription Demo"
    description="Real-time transcription using the SARAUDIO Vue hook, Soniox provider, and the shared recorder pipeline."
  >
    <template #alert>
      <div v-if="missingApiKey" class="p-4 rounded bg-red-900/40 border border-red-700 text-sm">
        <p class="font-semibold">Missing API key</p>
        <p>Set <code>NUXT_PUBLIC_SONIOX_API_KEY</code> in <code>.env</code> before using this demo.</p>
      </div>
    </template>

    <SectionCard>
      <div class="grid gap-4 lg:grid-cols-2">
        <DeepgramDeviceSelect
          v-model="selectedDeviceId"
          :devices="devicesList"
          :enumerating="audioInputs.enumerating.value"
          :disabled="recorderRunning"
          show-refresh
          @refresh="audioInputs.refresh"
        />

        <DeepgramVadControls v-model:threshold="thresholdDb" v-model:smooth="smoothMs" :disabled="recorderRunning" />
      </div>

      <DeepgramProviderControls
        v-model:model="selectedModel"
        v-model:language="selectedLanguage"
        v-model:mode="mode"
        v-model:transport="transportMode"
        :models="modelEntries"
        :languages="availableLanguages"
        :mode-disabled="recorderRunning"
        :transport-disabled="recorderRunning"
      />

      <DeepgramRecorderActions
        :start-disabled="recorderRunning || missingApiKey"
        :stop-disabled="!recorderRunning && !isConnected"
        :force-disabled="!isConnected"
        :show-force="!isHttpMode"
        :status="controllerStatus"
        :is-connected="isConnected"
        @start="start"
        @stop="stop"
        @force="forceEndpoint"
      />
    </SectionCard>

    <DeepgramStatsRow
      :vad-speech="vadState?.speech ?? false"
      :vad-score="vadState?.score ?? null"
      :rms="meterLevels.rms.value"
      :db="meterLevels.db.value"
      :transport="transcription.transport"
    />

    <section class="grid lg:grid-cols-2 gap-6">
      <DeepgramTranscriptPanel :transcript="transcriptText" :partial="partialText" @clear="clearTranscript" />
      <DeepgramRecentResults :results="latestResults" />
    </section>

    <DeepgramEventLog :events="events" @clear="clearEvents" />
  </PageShell>
</template>
