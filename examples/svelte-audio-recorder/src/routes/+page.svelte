<script lang="ts">
import type { Segment } from '@saraudio/core';
import { meter } from '@saraudio/meter';
import { type RuntimeMode, segmentToAudioBuffer } from '@saraudio/runtime-browser';
import { createAudioInputs, createMeter, createRecorder } from '@saraudio/svelte';
import { vadEnergy } from '@saraudio/vad-energy';
import { onMount } from 'svelte';

const THRESHOLD_KEY = 'saraudio:demo:thresholdDb';
const SMOOTH_KEY = 'saraudio:demo:smoothMs';
const MODE_KEY = 'saraudio:demo:captureMode';
const FALLBACK_KEY = 'saraudio:demo:allowFallback';

let thresholdDb = $state(-55);
let smoothMs = $state(30);
let mode = $state<RuntimeMode>('auto');
let allowFallback = $state(true);

// Load settings from localStorage
onMount(() => {
  if (typeof window === 'undefined') return;
  try {
    const savedThreshold = window.localStorage.getItem(THRESHOLD_KEY);
    if (savedThreshold) thresholdDb = Number(savedThreshold);
    const savedSmooth = window.localStorage.getItem(SMOOTH_KEY);
    if (savedSmooth) smoothMs = Number(savedSmooth);
    const savedMode = window.localStorage.getItem(MODE_KEY);
    if (savedMode === 'worklet' || savedMode === 'audio-context' || savedMode === 'auto') {
      mode = savedMode;
    }
    const savedFallback = window.localStorage.getItem(FALLBACK_KEY);
    if (savedFallback) allowFallback = savedFallback !== '0';
  } catch {}
});

// Save settings to localStorage
$effect(() => {
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(THRESHOLD_KEY, String(thresholdDb));
    } catch {}
  }
});
$effect(() => {
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(SMOOTH_KEY, String(smoothMs));
    } catch {}
  }
});
$effect(() => {
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(MODE_KEY, mode);
    } catch {}
  }
});
$effect(() => {
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(FALLBACK_KEY, allowFallback ? '1' : '0');
    } catch {}
  }
});

// Audio device selection
const audioInputs = createAudioInputs({
  promptOnMount: true,
  autoSelectFirst: true,
  rememberLast: true,
});

// Recorder with dynamic configuration
const rec = createRecorder({
  stages: [vadEnergy({ thresholdDb, smoothMs }), meter()],
  segmenter: { preRollMs: 300, hangoverMs: 500 },
  mode,
  allowFallback,
});

const meterLevels = createMeter({ pipeline: rec.pipeline });

// Recordings URLs
let cleanedUrl = $state<string | null>(null);
let fullUrl = $state<string | null>(null);
let maskedUrl = $state<string | null>(null);

// Segment playback
let audioCtxRef = $state<AudioContext | null>(null);
let sourceRef = $state<AudioBufferSourceNode | null>(null);
let playingId = $state<string | null>(null);

const stopCurrent = () => {
  const node = sourceRef;
  if (node) {
    try {
      node.stop();
    } catch {}
    node.disconnect();
    sourceRef = null;
  }
  playingId = null;
};

const playSegment = (s: Segment) => {
  if (!s.pcm || s.pcm.length === 0) return;
  stopCurrent();
  const ctx = audioCtxRef ?? new AudioContext({ sampleRate: s.sampleRate });
  audioCtxRef = ctx;
  const buffer = segmentToAudioBuffer(ctx, s);
  if (!buffer) return;
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.connect(ctx.destination);
  source.onended = () => {
    if (sourceRef === source) sourceRef = null;
    if (playingId === s.id) playingId = null;
  };
  sourceRef = source;
  playingId = s.id;
  source.start();
};

const handleToggleSegment = (s: Segment) => {
  if (playingId === s.id) {
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

  const cleaned = await rec.recordings.cleaned.getBlob();
  const full = await rec.recordings.full.getBlob();
  const masked = await rec.recordings.masked.getBlob();

  cleanedUrl = cleaned ? URL.createObjectURL(cleaned) : null;
  fullUrl = full ? URL.createObjectURL(full) : null;
  maskedUrl = masked ? URL.createObjectURL(masked) : null;
}

const isRunning = $derived(rec.status === 'running' || rec.status === 'acquiring');
</script>

<div class='min-h-screen bg-gray-900 text-white p-8'>
  <div class='max-w-6xl mx-auto'>
    <header class='mb-8'>
      <h1 class='text-4xl font-bold mb-4'>SARAUDIO · Svelte Demo</h1>
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
            bind:value={audioInputs.selectedDeviceId}
            onchange={(e) => audioInputs.setSelectedDeviceId(e.currentTarget.value)}
            disabled={audioInputs.enumerating || isRunning}
            class='w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:opacity-50'
          >
            {#each audioInputs.devices as device (device.deviceId)}
              <option value={device.deviceId}>
                {device.label || `Microphone ${device.deviceId.slice(0, 6)}`}
              </option>
            {/each}
          </select>
        </div>
        <button
          type='button'
          onclick={() => audioInputs.refresh()}
          disabled={audioInputs.enumerating || isRunning}
          class='px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg transition'
        >
          {audioInputs.enumerating ? 'Scanning...' : 'Refresh'}
        </button>
      </div>

      <!-- VAD Configuration -->
      <div class='grid grid-cols-2 gap-4'>
        <div>
          <label class='block text-sm text-gray-400 mb-2'>
            Energy Threshold: {thresholdDb} dB
          </label>
          <input
            type='range'
            min='-90'
            max='-5'
            step='1'
            bind:value={thresholdDb}
            class='w-full'
          />
        </div>
        <div>
          <label class='block text-sm text-gray-400 mb-2'>Smoothing: {smoothMs} ms</label>
          <input type='range' min='5' max='200' step='5' bind:value={smoothMs} class='w-full' />
        </div>
      </div>

      <!-- Capture Mode -->
      <div class='grid grid-cols-2 gap-4'>
        <div>
          <label class='block text-sm text-gray-400 mb-2'>Capture Mode</label>
          <select
            bind:value={mode}
            disabled={isRunning}
            class='w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:opacity-50'
          >
            <option value='auto'>Auto</option>
            <option value='worklet'>Worklet</option>
            <option value='audio-context'>AudioContext</option>
          </select>
        </div>
        <div class='flex items-end'>
          <label class='flex items-center gap-2 cursor-pointer'>
            <input type='checkbox' bind:checked={allowFallback} disabled={isRunning} class='w-4 h-4' />
            <span class='text-sm text-gray-400'>Allow fallback</span>
          </label>
        </div>
      </div>
    </section>

    <!-- Controls -->
    <div class='flex gap-4 mb-8'>
      <button
        type='button'
        onclick={handleStart}
        disabled={isRunning || rec.status === 'stopping'}
        class='px-6 py-3 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg font-medium transition'
      >
        {rec.status === 'acquiring' ? 'Acquiring...' : 'Start Microphone'}
      </button>
      <button
        type='button'
        onclick={handleStop}
        disabled={!isRunning}
        class='px-6 py-3 bg-red-600 hover:bg-red-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg font-medium transition'
      >
        Stop Microphone
      </button>
      <button
        type='button'
        onclick={() => rec.clearSegments()}
        disabled={rec.segments.length === 0}
        class='px-6 py-3 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg font-medium transition'
      >
        Clear Segments
      </button>
    </div>

    <!-- Status & Errors -->
    <div class='mb-8 space-y-2'>
      <div
        class={`px-4 py-2 rounded-lg border ${
          rec.status === 'running'
            ? 'bg-green-900/50 border-green-500'
            : rec.status === 'acquiring'
              ? 'bg-blue-900/50 border-blue-500'
              : 'bg-gray-800 border-gray-600'
        }`}
      >
        <span class='text-sm text-gray-400'>Status:</span>
        <span class='ml-2 font-mono'>{rec.status}</span>
      </div>
      {#if audioInputs.error}
        <div class='px-4 py-2 bg-red-900/50 border border-red-500 rounded-lg'>
          <span class='text-sm text-red-400'>Device Error:</span>
          <span class='ml-2'>{audioInputs.error}</span>
        </div>
      {/if}
      {#if rec.error}
        <div class='px-4 py-2 bg-red-900/50 border border-red-500 rounded-lg'>
          <span class='text-sm text-red-400'>Error:</span>
          <span class='ml-2'>{rec.error.message}</span>
        </div>
      {/if}
    </div>

    <!-- VAD & Meter -->
    <div class='grid grid-cols-2 gap-8 mb-8'>
      <!-- VAD -->
      <div class='p-6 bg-gray-800 rounded-lg'>
        <h2 class='text-xl font-semibold mb-4'>Voice Activity</h2>
        <div class='flex items-center gap-4 mb-4'>
          <div
            class={`w-6 h-6 rounded-full transition-all ${rec.vad?.speech ? 'bg-green-500' : 'bg-gray-600'}`}
          ></div>
          <div class='font-mono text-lg'>
            {rec.vad?.speech ? 'Speech' : 'Silence'}
          </div>
        </div>
        <div class='text-sm text-gray-400'>
          Score: {rec.vad?.score.toFixed(2) ?? '0.00'}
        </div>
      </div>

      <!-- Meter -->
      <div class='p-6 bg-gray-800 rounded-lg'>
        <h2 class='text-xl font-semibold mb-4'>Audio Levels</h2>
        <div class='space-y-3'>
          <div>
            <div class='flex justify-between text-sm text-gray-400 mb-1'>
              <span>RMS</span>
              <span>{meterLevels.rms.toFixed(3)}</span>
            </div>
            <div class='w-full bg-gray-700 h-3 rounded overflow-hidden'>
              <div
                class='bg-blue-500 h-full transition-all'
                style='width: {Math.min(meterLevels.rms * 100, 100)}%'
              ></div>
            </div>
          </div>
          <div>
            <div class='flex justify-between text-sm text-gray-400 mb-1'>
              <span>Peak</span>
              <span>{meterLevels.peak.toFixed(3)}</span>
            </div>
            <div class='w-full bg-gray-700 h-3 rounded overflow-hidden'>
              <div
                class='bg-green-500 h-full transition-all'
                style='width: {Math.min(meterLevels.peak * 100, 100)}%'
              ></div>
            </div>
          </div>
          <div class='flex justify-between text-sm text-gray-400'>
            <span>dB</span>
            <span>{meterLevels.db === -Infinity ? '-∞' : meterLevels.db.toFixed(1)}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Segments -->
    <section class='mb-8 p-6 bg-gray-800 rounded-lg'>
      <h2 class='text-xl font-semibold mb-4'>
        Captured Segments ({rec.segments.length})
      </h2>
      {#if rec.segments.length === 0}
        <div class='text-gray-500 text-center py-8'>
          Talk into the microphone to capture segments
        </div>
      {:else}
        <div class='space-y-2 max-h-96 overflow-y-auto'>
          {#each rec.segments as segment (segment.id)}
            <div class='p-4 bg-gray-700 rounded-lg flex items-center gap-4'>
              <button
                type='button'
                onclick={() => handleToggleSegment(segment)}
                class='w-10 h-10 flex items-center justify-center bg-gray-600 hover:bg-gray-500 rounded-lg transition'
                title={playingId === segment.id ? 'Stop segment' : 'Play segment'}
              >
                {playingId === segment.id ? '■' : '▶'}
              </button>
              <div class='flex-1'>
                <div class='flex items-center justify-between mb-1'>
                  <div class='font-mono text-xs text-gray-400'>
                    #{segment.id.slice(0, 8).toUpperCase()}
                  </div>
                  <div class='text-xs text-gray-400'>
                    {(segment.durationMs / 1000).toFixed(2)}s
                  </div>
                </div>
                <div class='text-sm text-gray-300'>
                  {new Date(segment.startMs).toLocaleTimeString()} →
                  {new Date(segment.endMs).toLocaleTimeString()}
                </div>
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </section>

    <!-- Recordings -->
    <section class='p-6 bg-gray-800 rounded-lg'>
      <h2 class='text-xl font-semibold mb-4'>Recordings</h2>
      <div class='space-y-4'>
        <div class='p-4 bg-gray-700 rounded-lg'>
          <div class='text-sm font-medium mb-2'>Cleaned (speech only)</div>
          {#if cleanedUrl}
            <!-- svelte-ignore a11y_media_has_caption -->
            <audio controls src={cleanedUrl} class='w-full' />
          {:else}
            <div class='text-sm text-gray-500'>No recording yet</div>
          {/if}
        </div>
        <div class='p-4 bg-gray-700 rounded-lg'>
          <div class='text-sm font-medium mb-2'>Full (entire session)</div>
          {#if fullUrl}
            <!-- svelte-ignore a11y_media_has_caption -->
            <audio controls src={fullUrl} class='w-full' />
          {:else}
            <div class='text-sm text-gray-500'>No recording yet</div>
          {/if}
        </div>
        <div class='p-4 bg-gray-700 rounded-lg'>
          <div class='text-sm font-medium mb-2'>Masked (silence as zeros)</div>
          {#if maskedUrl}
            <!-- svelte-ignore a11y_media_has_caption -->
            <audio controls src={maskedUrl} class='w-full' />
          {:else}
            <div class='text-sm text-gray-500'>No recording yet</div>
          {/if}
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
