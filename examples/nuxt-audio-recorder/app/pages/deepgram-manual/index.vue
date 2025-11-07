<script setup lang="ts">
import type { MeterPayload, TranscriptResult, VADScore } from '@saraudio/core';
import {
  DEEPGRAM_MODEL_DEFINITIONS,
  deepgram,
  isLanguageSupported,
  type DeepgramLanguage,
  type DeepgramModelId,
} from '@saraudio/deepgram';
import { meter } from '@saraudio/meter';
import {
  createRecorder,
  createTranscription,
  listAudioInputs,
  watchAudioDeviceChanges,
  type RuntimeMode,
} from '@saraudio/runtime-browser';
import { vadEnergy } from '@saraudio/vad-energy';
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRuntimeConfig } from '#app';
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

const mode = ref<RuntimeMode>('auto');
const allowFallback = ref(true);
const thresholdDb = ref(-50);
const smoothMs = ref(30);
const transportMode = ref<'websocket' | 'http'>('websocket');
const selectedModel = ref<DeepgramModelId>('nova-3');
const selectedLanguage = ref<DeepgramLanguage>('en-US');

const config = useRuntimeConfig();

// Device management with pure API
const devicesList = ref<MediaDeviceInfo[]>([]);
const selectedDeviceId = ref<string>('');
const enumerating = ref(false);

async function refreshDevices() {
  enumerating.value = true;
  try {
    const result = await listAudioInputs({ requestPermission: 'auto' });
    devicesList.value = result.devices;
    const firstDevice = result.devices[0];
    if (firstDevice && !selectedDeviceId.value) {
      selectedDeviceId.value = firstDevice.deviceId;
    }
  } finally {
    enumerating.value = false;
  }
}

// Recorder with pure API
const recorderStatus = ref<'idle' | 'acquiring' | 'running' | 'stopped'>('idle');
const vadState = ref<VADScore | null>(null);
const meterState = ref<MeterPayload>({ rms: 0, peak: 0, db: -100, tsMs: 0 });

const rec = createRecorder({
  stages: [vadEnergy({ thresholdDb: thresholdDb.value, smoothMs: smoothMs.value }), meter()],
  segmenter: { preRollMs: 120, hangoverMs: 250 },
  source: { microphone: { deviceId: selectedDeviceId.value } },
  format: { sampleRate: 16000 },
  mode: mode.value,
  allowFallback: allowFallback.value,
});

// Subscribe to recorder events
const unsubVad = rec.onVad((vad) => {
  vadState.value = vad;
});

const unsubMeter = rec.pipeline.events.on('meter', (payload) => {
  meterState.value = payload;
});

const unsubError = rec.onError((error) => {
  console.error('[recorder] error:', error);
});

// Deepgram transcription with pure API
const transcript = ref('');
const partial = ref('');
const latestResults = ref<TranscriptResult[]>([]);
const events = ref<string[]>([]);

const MAX_EVENTS = 60;
const MAX_RESULTS = 20;

const pushEvent = (message: string) => {
  events.value.unshift(`${new Date().toLocaleTimeString()} ${message}`);
  if (events.value.length > MAX_EVENTS) events.value.length = MAX_EVENTS;
};

const resolveToken = async (): Promise<string> => {
  const key = config.public.deepgramApiKey;
  if (!key || typeof key !== 'string' || key.trim().length === 0) {
    throw new Error('Missing NUXT_PUBLIC_DEEPGRAM_API_KEY');
  }
  return key.trim();
};

const provider = deepgram({
  model: selectedModel.value,
  language: selectedLanguage.value,
  interimResults: true,
  punctuate: true,
  auth: { getToken: resolveToken },
});

let transcription = createTranscription({
  provider,
  transport: transportMode.value,
  recorder: rec,
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
});

let unsubTranscript = transcription.onTranscript((result) => {
  if (transcript.value) {
    transcript.value += ' ' + result.text;
  } else {
    transcript.value = result.text;
  }
  latestResults.value.unshift(result);
  if (latestResults.value.length > MAX_RESULTS) latestResults.value.length = MAX_RESULTS;
  pushEvent(`[transcript] ${result.text}`);
});

let unsubPartial = transcription.onPartial((text) => {
  partial.value = text;
});

let unsubTransError = transcription.onError((err) => {
  pushEvent(`[error] ${err.message}`);
});

let unsubStatus = transcription.onStatusChange((status) => {
  pushEvent(`[status] ${status}`);
});

// Recreate transcription when transport changes
watch(transportMode, async (newTransport, oldTransport) => {
  if (newTransport === oldTransport) return;

  pushEvent(`[config] transport changed: ${oldTransport} → ${newTransport}`);

  const wasConnected = transcription.isConnected;

  if (wasConnected) {
    await transcription.disconnect();
  }

  unsubTranscript();
  unsubPartial();
  unsubTransError();
  unsubStatus();

  transcript.value = '';
  partial.value = '';
  latestResults.value = [];

  transcription = createTranscription({
    provider,
    transport: newTransport,
    recorder: rec,
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
  });

  unsubTranscript = transcription.onTranscript((result) => {
    if (transcript.value) {
      transcript.value += ' ' + result.text;
    } else {
      transcript.value = result.text;
    }
    latestResults.value.unshift(result);
    if (latestResults.value.length > MAX_RESULTS) latestResults.value.length = MAX_RESULTS;
    pushEvent(`[transcript] ${result.text}`);
  });

  unsubPartial = transcription.onPartial((text) => {
    partial.value = text;
  });

  unsubTransError = transcription.onError((err) => {
    pushEvent(`[error] ${err.message}`);
  });

  unsubStatus = transcription.onStatusChange((status) => {
    pushEvent(`[status] ${status}`);
  });

  if (wasConnected) {
    await transcription.connect();
  }
});

const transcriptText = computed(() => transcript.value.trim());
const partialText = computed(() => partial.value);
const transcriptionStatus = computed(() => transcription.status);
const isConnected = computed(() => transcription.isConnected);
const missingApiKey = computed(() => {
  const key = config.public.deepgramApiKey;
  return !key || typeof key !== 'string' || key.trim().length === 0;
});

onMounted(async () => {
  await refreshDevices();
  const unwatch = watchAudioDeviceChanges(() => {
    void refreshDevices();
  });
  onUnmounted(unwatch);
});

async function start() {
  await transcription.connect();
  recorderStatus.value = 'acquiring';
  await rec.start();
  recorderStatus.value = 'running';
  pushEvent('[action] recording + transcription started');
}

async function stop() {
  await rec.stop();
  recorderStatus.value = 'stopped';
  meterState.value = { rms: 0, peak: 0, db: -100, tsMs: 0 };
  await transcription.disconnect();
  pushEvent('[action] recording stopped, transcription disconnected');
}

const clearTranscript = () => {
  transcript.value = '';
  partial.value = '';
  latestResults.value = [];
};

const clearEvents = () => {
  events.value = [];
};

const forceEndpoint = async () => {
  await transcription.forceEndpoint();
  pushEvent('[action] force endpoint');
};

const isRunning = computed(() => recorderStatus.value === 'running' || recorderStatus.value === 'acquiring');
const isHttpMode = computed(() => transportMode.value === 'http');

const modelEntries = computed(() =>
  (Object.keys(DEEPGRAM_MODEL_DEFINITIONS) as DeepgramModelId[]).map((id) => ({
    id,
    label: DEEPGRAM_MODEL_DEFINITIONS[id].label,
  })),
);

const availableLanguages = computed(() => [...DEEPGRAM_MODEL_DEFINITIONS[selectedModel.value].languages]);

watch(selectedModel, (modelId) => {
  if (!isLanguageSupported(modelId, selectedLanguage.value)) {
    const fallback = DEEPGRAM_MODEL_DEFINITIONS[modelId].languages[0] as DeepgramLanguage;
    selectedLanguage.value = fallback;
  }
});

// Update recorder config on settings change
watch([thresholdDb, smoothMs], () => {
  rec.update({
    stages: [vadEnergy({ thresholdDb: thresholdDb.value, smoothMs: smoothMs.value }), meter()],
  });
});

watch(selectedDeviceId, (deviceId) => {
  rec.update({
    source: { microphone: { deviceId } },
  });
});

onUnmounted(() => {
  unsubVad();
  unsubMeter();
  unsubError();
  unsubTranscript();
  unsubPartial();
  unsubTransError();
  unsubStatus();
  rec.dispose();
  void stop();
});
</script>

<template>
  <PageShell
    title="Deepgram Manual API · Pure SARAUDIO"
    description="Live transcription using pure SARAUDIO API without Vue integration hooks"
  >
    <template #alert>
      <div v-if="missingApiKey" class="p-4 rounded bg-red-900/40 border border-red-700 text-sm">
        <p class="font-semibold">Missing API key</p>
        <p>Set <code>NUXT_PUBLIC_DEEPGRAM_API_KEY</code> in <code>.env</code> before using this demo.</p>
      </div>
    </template>

    <SectionCard>
      <div class="grid gap-4 lg:grid-cols-2">
        <DeepgramDeviceSelect
          v-model="selectedDeviceId"
          :devices="devicesList"
          :disabled="isRunning"
          show-refresh
          :enumerating="enumerating"
          @refresh="refreshDevices"
        />
        <DeepgramVadControls v-model:threshold="thresholdDb" v-model:smooth="smoothMs" />
      </div>

      <DeepgramProviderControls
        v-model:model="selectedModel"
        v-model:language="selectedLanguage"
        v-model:mode="mode"
        v-model:transport="transportMode"
        :models="modelEntries"
        :languages="availableLanguages"
        :mode-disabled="isRunning"
        :transport-disabled="isRunning"
      />

      <DeepgramRecorderActions
        :start-disabled="isRunning || missingApiKey"
        :stop-disabled="!isRunning"
        :force-disabled="!isConnected"
        :show-force="!isHttpMode"
        :status="transcriptionStatus"
        :is-connected="isConnected"
        @start="start"
        @stop="stop"
        @force="forceEndpoint"
      />
    </SectionCard>

    <DeepgramStatsRow
      :vad-speech="vadState?.speech ?? false"
      :vad-score="vadState?.score ?? null"
      :rms="meterState.rms"
      :db="meterState.db"
      :transport="transcription.transport"
      :manual-ws="false"
    />

    <section class="grid lg:grid-cols-2 gap-6">
      <DeepgramTranscriptPanel :transcript="transcriptText" :partial="partialText" @clear="clearTranscript" />
      <DeepgramRecentResults :results="latestResults" />
    </section>

    <DeepgramEventLog :events="events" @clear="clearEvents" />
  </PageShell>
</template>
