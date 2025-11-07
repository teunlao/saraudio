<script setup lang="ts">
import type { SubscribeHandle, TranscriptResult } from '@saraudio/core';
import {
  DEEPGRAM_MODEL_DEFINITIONS,
  isLanguageSupported,
  type DeepgramLanguage,
  type DeepgramModelId,
} from '@saraudio/deepgram';
import { meter } from '@saraudio/meter';
import type { RuntimeMode } from '@saraudio/runtime-browser';
import { vadEnergy } from '@saraudio/vad-energy';
import { useAudioInputs, useMeter, useRecorder } from '@saraudio/vue';
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRuntimeConfig } from '#app';
import { useDeepgramRealtime } from './useDeepgramRealtime';
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

const audioInputs = useAudioInputs({ promptOnMount: true, autoSelectFirst: true, rememberLast: true });
const devicesList = computed(() => audioInputs.devices.value ?? []);
const selectedDeviceId = computed({
  get: () => audioInputs.selectedDeviceId.value,
  set: (value: string) => {
    audioInputs.selectedDeviceId.value = value;
  },
});

const rec = useRecorder({
  stages: computed(() => [vadEnergy({ thresholdDb: thresholdDb.value, smoothMs: smoothMs.value }), meter()]),
  segmenter: { preRollMs: 120, hangoverMs: 250 },
  source: computed(() => ({ microphone: { deviceId: audioInputs.selectedDeviceId.value } })),
  format: { sampleRate: 16000 },
  mode,
  allowFallback,
});

const levels = useMeter({ pipeline: rec.pipeline });
const vadState = computed(() => rec.vad.value);

const dg = useDeepgramRealtime();
let frameSubscription: SubscribeHandle | null = null;
let readySubscription: SubscribeHandle | null = null;

const transcriptText = computed(() => dg.transcript.value.trim());
const partialText = computed(() => dg.partial.value);
const latestResults = computed<TranscriptResult[]>(() =>
  dg.segments.value.map((text): TranscriptResult => ({ text, language: selectedLanguage.value })),
);
const missingApiKey = computed(() => {
  const key = config.public.deepgramApiKey;
  return !key || typeof key !== 'string' || key.trim().length === 0;
});
const events = computed(() => dg.log.value);
const isConnected = computed(() => dg.status.value === 'open');

onMounted(() => {
  readySubscription = rec.onReady(() => {
    console.log('[nuxt] recorder ready — streaming normalized frames');
  });
  frameSubscription = rec.subscribeFrames((frame) => {

    dg.sendPcm16(frame.pcm, frame.sampleRate);
  });
});

async function start() {
  dg.connect();
  await rec.start();
}

async function stop() {
  await rec.stop();
  levels.reset();
  dg.close();
}

const clearTranscript = () => {
  dg.clear();
};

const clearEvents = () => {
  dg.clearLog();
};

const forceEndpoint = () => {
  dg.log.value.unshift('[action] force endpoint not available (manual WS demo)');
  if (dg.log.value.length > 60) dg.log.value.length = 60;
};

const isRunning = computed(() => rec.status.value === 'running' || rec.status.value === 'acquiring');

const modelEntries = computed(() =>
  (Object.keys(DEEPGRAM_MODEL_DEFINITIONS) as DeepgramModelId[]).map((id) => ({
    id,
    label: DEEPGRAM_MODEL_DEFINITIONS[id].label,
  })),
);

const availableLanguages = computed(() => [...DEEPGRAM_MODEL_DEFINITIONS[selectedModel.value].languages]);

dg.model.value = selectedModel.value;
dg.language.value = selectedLanguage.value;

watch(selectedModel, (modelId) => {
  dg.model.value = modelId;
  if (!isLanguageSupported(modelId, selectedLanguage.value)) {
    const fallback = DEEPGRAM_MODEL_DEFINITIONS[modelId].languages[0] as DeepgramLanguage;
    selectedLanguage.value = fallback;
    dg.language.value = fallback;
  }
});

watch(selectedLanguage, (lang) => {
  dg.language.value = lang;
});

onUnmounted(() => {
  readySubscription?.()
  frameSubscription?.()
  void stop();
});
</script>

<template>
  <PageShell
    title="Deepgram Realtime · Nuxt + SARAUDIO"
    description="Live transcription using AudioWorklet/MediaRecorder pipeline"
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
          :enumerating="audioInputs.enumerating.value"
          @refresh="audioInputs.refresh"
        />
        <DeepgramVadControls v-model:threshold="thresholdDb" v-model:smooth="smoothMs" :disabled="isRunning" />
      </div>

      <DeepgramProviderControls
        v-model:model="selectedModel"
        v-model:language="selectedLanguage"
        v-model:mode="mode"
        v-model:transport="transportMode"
        :models="modelEntries"
        :languages="availableLanguages"
        :mode-disabled="isRunning"
        :transport-disabled="true"
      />

      <DeepgramRecorderActions
        :start-disabled="isRunning || missingApiKey"
        :stop-disabled="!isRunning"
        :force-disabled="true"
        :show-force="true"
        :status="dg.status.value"
        :is-connected="isConnected"
        @start="start"
        @stop="stop"
        @force="forceEndpoint"
      />
    </SectionCard>

    <DeepgramStatsRow
      :vad-speech="vadState?.speech ?? false"
      :vad-score="vadState?.score ?? null"
      :rms="levels.rms.value"
      :db="levels.db.value"
      transport="websocket"
      :manual-ws="true"
    />

    <section class="grid lg:grid-cols-2 gap-6">
      <DeepgramTranscriptPanel :transcript="transcriptText" :partial="partialText" @clear="clearTranscript" />
      <DeepgramRecentResults :results="latestResults" />
    </section>

    <DeepgramEventLog :events="events" @clear="clearEvents" />
  </PageShell>
</template>
