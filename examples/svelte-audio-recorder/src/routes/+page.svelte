<script lang="ts">
import type { Segment } from '@saraudio/core';
import { createAudioMeterStage } from '@saraudio/meter';
import type { Recorder } from '@saraudio/runtime-browser';
import { createBrowserRuntime, createRecorder } from '@saraudio/runtime-browser';
import { createEnergyVadStage } from '@saraudio/vad-energy';
import { onMount } from 'svelte';

let recorder = $state<Recorder | null>(null);
let status = $state<'idle' | 'acquiring' | 'running' | 'stopping' | 'error'>('idle');
let error = $state<Error | null>(null);
let segments = $state<Segment[]>([]);
let meterLevels = $state({ rms: 0, peak: 0, db: -Infinity });
let vadScore = $state<number>(0);
let isSpeech = $state(false);

onMount(() => {
  const runtime = createBrowserRuntime();
  const vad = createEnergyVadStage({ thresholdDb: -50, smoothMs: 100 });
  const meter = createAudioMeterStage();

  recorder = createRecorder({
    runtime,
    stages: [vad, meter],
    segmenter: { preRollMs: 300, hangoverMs: 500 },
  });

  recorder.onVad((v) => {
    vadScore = v.score;
    isSpeech = v.speech;
  });

  recorder.onSegment((s) => {
    segments = segments.length >= 10 ? [...segments.slice(1), s] : [...segments, s];
  });

  recorder.onError((e) => {
    error = new Error(e.message);
  });

  const pipeline = recorder.pipeline;
  pipeline.events.on('meter', (payload) => {
    meterLevels = { rms: payload.rms, peak: payload.peak, db: payload.db };
  });

  return () => {
    recorder?.dispose();
  };
});

async function handleStart() {
  if (!recorder) return;
  try {
    status = 'acquiring';
    await recorder.start();
    status = 'running';
  } catch (e) {
    error = e instanceof Error ? e : new Error(String(e));
    status = 'error';
  }
}

async function handleStop() {
  if (!recorder) return;
  try {
    status = 'stopping';
    await recorder.stop();
    status = 'idle';
  } catch (e) {
    error = e instanceof Error ? e : new Error(String(e));
    status = 'error';
  }
}

function clearSegments() {
  segments = [];
}
</script>

<div class="min-h-screen bg-gray-900 text-white p-8">
	<div class="max-w-4xl mx-auto">
		<h1 class="text-4xl font-bold mb-8">Saraudio Svelte Demo</h1>

		<!-- Controls -->
		<div class="flex gap-4 mb-8">
			<button
				onclick={handleStart}
				disabled={status === 'running' || status === 'acquiring'}
				class="px-6 py-3 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg font-medium transition"
			>
				{status === 'acquiring' ? 'Acquiring...' : 'Start'}
			</button>
			<button
				onclick={handleStop}
				disabled={status !== 'running'}
				class="px-6 py-3 bg-red-600 hover:bg-red-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg font-medium transition"
			>
				Stop
			</button>
		</div>

		<!-- Status -->
		<div class="mb-8 p-4 bg-gray-800 rounded-lg">
			<div class="text-sm text-gray-400 mb-2">Status</div>
			<div class="text-2xl font-mono">{status}</div>
		</div>

		<!-- Error -->
		{#if error}
			<div class="mb-8 p-4 bg-red-900/50 border border-red-500 rounded-lg">
				<div class="text-sm text-red-400 mb-2">Error</div>
				<div class="font-mono">{error.message}</div>
			</div>
		{/if}

		<!-- VAD -->
		<div class="mb-8 p-4 bg-gray-800 rounded-lg">
			<div class="text-sm text-gray-400 mb-2">Voice Activity Detection</div>
			<div class="flex items-center gap-4">
				<div
					class="w-4 h-4 rounded-full {isSpeech ? 'bg-green-500' : 'bg-gray-600'} transition"
				></div>
				<div class="font-mono">{isSpeech ? 'Speech' : 'Silence'}</div>
				<div class="text-gray-400 font-mono">Score: {vadScore.toFixed(2)}</div>
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
							style="width: {Math.min(meterLevels.rms * 100, 100)}%"
						></div>
					</div>
					<div class="w-20 text-right font-mono text-sm">{meterLevels.rms.toFixed(3)}</div>
				</div>
				<div class="flex items-center gap-4">
					<div class="w-16 text-sm text-gray-400">Peak</div>
					<div class="flex-1 bg-gray-700 h-4 rounded overflow-hidden">
						<div
							class="bg-green-500 h-full transition-all"
							style="width: {Math.min(meterLevels.peak * 100, 100)}%"
						></div>
					</div>
					<div class="w-20 text-right font-mono text-sm">{meterLevels.peak.toFixed(3)}</div>
				</div>
				<div class="flex items-center gap-4">
					<div class="w-16 text-sm text-gray-400">dB</div>
					<div class="w-20 text-right font-mono text-sm">
						{meterLevels.db === -Infinity ? '-∞' : meterLevels.db.toFixed(1)}
					</div>
				</div>
			</div>
		</div>

		<!-- Segments -->
		<div class="p-4 bg-gray-800 rounded-lg">
			<div class="flex items-center justify-between mb-4">
				<div class="text-sm text-gray-400">Segments ({segments.length})</div>
				<button
					onclick={clearSegments}
					class="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded text-sm transition"
				>
					Clear
				</button>
			</div>
			{#if segments.length === 0}
				<div class="text-gray-500 text-center py-8">No segments yet</div>
			{:else}
				<div class="space-y-2 max-h-96 overflow-y-auto">
					{#each segments as segment (segment.id)}
						<div class="p-3 bg-gray-700 rounded">
							<div class="flex items-center justify-between mb-1">
								<div class="font-mono text-xs text-gray-400">#{segment.id.slice(0, 8)}</div>
								<div class="text-xs text-gray-400">
									{Math.round(segment.durationMs)}ms
								</div>
							</div>
							<div class="text-sm">
								{new Date(segment.startMs).toLocaleTimeString()} - {new Date(
									segment.endMs
								).toLocaleTimeString()}
							</div>
						</div>
					{/each}
				</div>
			{/if}
		</div>
	</div>
</div>
