<script setup lang="ts">
import type { TranscriptResult, TranscriptUpdate } from '@saraudio/core';
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

// Local ephemeral token cache to reduce server calls
let cachedToken: { value: string; expiresAt: number } | null = null;
const nowMs = () => Date.now();

type EphemeralTokenPayload = { access_token: string; expires_in: number };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isEphemeralTokenPayload(value: unknown): value is EphemeralTokenPayload {
  if (!isRecord(value)) return false;
  const token = value.access_token;
  const ttl = value.expires_in;
  return typeof token === 'string' && token.length > 0 && typeof ttl === 'number' && Number.isFinite(ttl);
}

function readErrorMessage(value: unknown): string | null {
  if (!isRecord(value)) return null;
  const msg = value.message;
  return typeof msg === 'string' ? msg : null;
}

async function fetchEphemeralToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt - nowMs() > 2000) {
    return cachedToken.value;
  }

  let response: Response;
  try {
    response = await fetch('/api/stt/session?provider=deepgram');
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to obtain Deepgram token (network): ${reason}`);
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    payload = undefined;
  }

  if (!response.ok) {
    const msg = readErrorMessage(payload) ?? `Failed to obtain Deepgram token (${response.status})`;
    throw new Error(msg);
  }

  // Unified session format: { token, expiresIn }
  const tokenUnknown = (payload as { token?: unknown })?.token;
  const expiresUnknown = (payload as { expiresIn?: unknown })?.expiresIn;
  if (typeof tokenUnknown !== 'string' || tokenUnknown.length === 0) {
    throw new Error('Invalid token payload from /api/stt/session');
  }
  const ttlSeconds = typeof expiresUnknown === 'number' && Number.isFinite(expiresUnknown) ? expiresUnknown : 30;
  const token = tokenUnknown;
  const safeTtl = Math.max(1, Math.floor(ttlSeconds - 2));
  cachedToken = { value: token, expiresAt: nowMs() + safeTtl * 1000 };
  return token;
}

const selectedModel = ref<DeepgramModelId>('nova-3');
const selectedLanguage = ref<DeepgramLanguage>('en-US');

const thresholdDb = ref(-55);
const smoothMs = ref(25);
const mode = ref<RuntimeMode>('auto');
const allowFallback = ref(true);
const transportMode = ref<'websocket' | 'http'>('websocket');

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
  set: (value: string) => { audioInputs.selectedDeviceId.value = value; },
});
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

let pendingFinalText = '';
const handleUpdate = (update: TranscriptUpdate) => {
  const finalChunk = update.tokens
    .filter((t) => t.isFinal)
    .map((t) => t.text)
    .join('');
  if (finalChunk) pendingFinalText = `${pendingFinalText}${finalChunk}`;

  if (update.finalize !== true) return;

  const text = pendingFinalText.trim();
  pendingFinalText = '';
  if (!text) return;

  const result: TranscriptResult = {
    text,
    language: update.language,
    turnId: update.turnId,
    span: update.span,
    metadata: update.metadata,
  };

  latestResults.value.unshift(result);
  if (latestResults.value.length > MAX_RESULTS) latestResults.value.length = MAX_RESULTS;
  pushEvent(`[transcript] ${result.text}`);
};

const provider = computed(() => {
  const model = selectedModel.value;
  const language = ensureLanguage(model, selectedLanguage.value);
  if (language !== selectedLanguage.value) {
    selectedLanguage.value = language;
  }
  return deepgram({
    model,
    language,
    interimResults: true,
    punctuate: true,
    // Secure: browser asks our server for an ephemeral JWT
    auth: { getToken: fetchEphemeralToken },
  });
});

const transcription = useTranscription({
  provider,
  transport: transportMode,
  recorder,
  preconnectBufferMs: 120,
  flushOnSegmentEnd: true,
  connection: {
    ws: {
      retry: { enabled: true, maxAttempts: 5, baseDelayMs: 300, factor: 2, maxDelayMs: 5000, jitterRatio: 0.2 },
    },
    http: {
      chunking: { intervalMs: 2500, minDurationMs: 1000, overlapMs: 300, maxInFlight: 1, timeoutMs: 15000 },
    },
  },
  onUpdate: handleUpdate,
  onError: (err) => { pushEvent(`[error] ${err.message}`); },
});

watch(
  () => transcription.status.value,
  (next, prev) => { if (prev && next !== prev) pushEvent(`[status] ${prev} → ${next}`); },
);

let lastSelection: { model: DeepgramModelId; language: DeepgramLanguage; transport: 'websocket' | 'http' } | null = null;
watch([selectedModel, selectedLanguage, transportMode], ([model, lang, transport]) => {
  const effectiveLanguage = ensureLanguage(model, lang);
  if (!lastSelection) {
    lastSelection = { model, language: effectiveLanguage, transport };
    pushEvent(`[config] provider set to model=${model}, language=${effectiveLanguage}, transport=${transport}`);
    return;
  }
  if (lastSelection.model === model && lastSelection.language === effectiveLanguage && lastSelection.transport === transport) return;
  const previousTransport = lastSelection.transport;
  lastSelection = { model, language: effectiveLanguage, transport };
  pushEvent(`[config] provider updated: model=${model}, language=${effectiveLanguage}, transport=${transport}`);
  if (transport !== previousTransport) {
    pendingFinalText = '';
    latestResults.value.length = 0;
    transcription.clear();
  }
});

const transcriptText = computed(() => transcription.transcript.value.trim());
const partialText = computed(() => transcription.partial.value);
const controllerStatus = computed(() => transcription.status.value);
const isConnected = computed(() => transcription.isConnected.value);
const recorderRunning = computed(() => recorder.status.value === 'running' || recorder.status.value === 'acquiring');

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
  try { await recorder.stop(); } catch {}
  meterLevels.reset();
  pendingFinalText = '';
  await transcription.disconnect();
  pushEvent('[action] recording stopped, transcription disconnected');
};

const forceEndpoint = async () => {
  await transcription.forceEndpoint();
  pushEvent('[action] force endpoint');
};

const clearTranscript = () => {
  pendingFinalText = '';
  transcription.clear();
};
const clearEvents = () => { events.value = []; };

onUnmounted(() => { void stop(); });
</script>

<template>
  <PageShell
    title="Deepgram · Ephemeral Token Demo"
    description="Real-time transcription using secure ephemeral tokens from your server."
  >
    <template #alert>
      <div class="p-4 rounded bg-amber-900/30 border border-amber-700 text-sm">
        <p class="font-semibold">Secure Auth</p>
        <p>Server issues short‑lived tokens via <code>/api/deepgram/token</code>. Set <code>NUXT_DEEPGRAM_API_KEY</code> on server.</p>
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

        <DeepgramVadControls v-model:threshold="thresholdDb" v-model:smooth="smoothMs" />
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
        :start-disabled="recorderRunning"
        :stop-disabled="!recorderRunning && !isConnected"
        :force-disabled="!isConnected"
        :show-force="transportMode !== 'http'"
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
