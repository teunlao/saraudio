import { meter } from '@saraudio/meter';
import { createMeter, createRecorder } from '@saraudio/solid';
import { vadEnergy } from '@saraudio/vad-energy';
import { For, Show } from 'solid-js';

export default function Home() {
  const rec = createRecorder({
    stages: [vadEnergy({ thresholdDb: -50, smoothMs: 100 }), meter()],
    segmenter: { preRollMs: 300, hangoverMs: 500 },
  });

  const meterLevels = createMeter({ pipeline: rec.pipeline });

  async function handleStart() {
    await rec.start();
  }

  async function handleStop() {
    await rec.stop();
    meterLevels.reset();
  }

  return (
    <div class='min-h-screen bg-gray-900 text-white p-8'>
      <div class='max-w-4xl mx-auto'>
        <h1 class='text-4xl font-bold mb-8'>Saraudio SolidStart Demo</h1>

        {/* Controls */}
        <div class='flex gap-4 mb-8'>
          <button
            type='button'
            onClick={handleStart}
            disabled={rec.status() === 'running' || rec.status() === 'acquiring'}
            class='px-6 py-3 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg font-medium transition'
          >
            {rec.status() === 'acquiring' ? 'Acquiring...' : 'Start'}
          </button>
          <button
            type='button'
            onClick={handleStop}
            disabled={rec.status() !== 'running'}
            class='px-6 py-3 bg-red-600 hover:bg-red-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg font-medium transition'
          >
            Stop
          </button>
        </div>

        {/* Status */}
        <div class='mb-8 p-4 bg-gray-800 rounded-lg'>
          <div class='text-sm text-gray-400 mb-2'>Status</div>
          <div class='text-2xl font-mono'>{rec.status()}</div>
        </div>

        {/* Error */}
        <Show when={rec.error()}>
          <div class='mb-8 p-4 bg-red-900/50 border border-red-500 rounded-lg'>
            <div class='text-sm text-red-400 mb-2'>Error</div>
            <div class='font-mono'>{rec.error()?.message}</div>
          </div>
        </Show>

        {/* VAD */}
        <div class='mb-8 p-4 bg-gray-800 rounded-lg'>
          <div class='text-sm text-gray-400 mb-2'>Voice Activity Detection</div>
          <div class='flex items-center gap-4'>
            <div
              class='w-4 h-4 rounded-full transition'
              classList={{
                'bg-green-500': rec.vad()?.speech,
                'bg-gray-600': !rec.vad()?.speech,
              }}
            />
            <div class='font-mono'>{rec.vad()?.speech ? 'Speech' : 'Silence'}</div>
            <div class='text-gray-400 font-mono'>Score: {rec.vad()?.score.toFixed(2) ?? '0.00'}</div>
          </div>
        </div>

        {/* Meter */}
        <div class='mb-8 p-4 bg-gray-800 rounded-lg'>
          <div class='text-sm text-gray-400 mb-2'>Audio Levels</div>
          <div class='space-y-2'>
            <div class='flex items-center gap-4'>
              <div class='w-16 text-sm text-gray-400'>RMS</div>
              <div class='flex-1 bg-gray-700 h-4 rounded overflow-hidden'>
                <div
                  class='bg-blue-500 h-full transition-all'
                  style={{ width: `${Math.min(meterLevels.rms() * 100, 100)}%` }}
                />
              </div>
              <div class='w-20 text-right font-mono text-sm'>{meterLevels.rms().toFixed(3)}</div>
            </div>
            <div class='flex items-center gap-4'>
              <div class='w-16 text-sm text-gray-400'>Peak</div>
              <div class='flex-1 bg-gray-700 h-4 rounded overflow-hidden'>
                <div
                  class='bg-green-500 h-full transition-all'
                  style={{ width: `${Math.min(meterLevels.peak() * 100, 100)}%` }}
                />
              </div>
              <div class='w-20 text-right font-mono text-sm'>{meterLevels.peak().toFixed(3)}</div>
            </div>
            <div class='flex items-center gap-4'>
              <div class='w-16 text-sm text-gray-400'>dB</div>
              <div class='w-20 text-right font-mono text-sm'>
                {meterLevels.db() === -Infinity ? '-∞' : meterLevels.db().toFixed(1)}
              </div>
            </div>
          </div>
        </div>

        {/* Segments */}
        <div class='p-4 bg-gray-800 rounded-lg'>
          <div class='flex items-center justify-between mb-4'>
            <div class='text-sm text-gray-400'>Segments ({rec.segments().length})</div>
            <button
              type='button'
              onClick={() => rec.clearSegments()}
              class='px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded text-sm transition'
            >
              Clear
            </button>
          </div>
          <Show
            when={rec.segments().length === 0}
            fallback={
              <div class='space-y-2 max-h-96 overflow-y-auto'>
                <For each={rec.segments()}>
                  {(segment) => (
                    <div class='p-3 bg-gray-700 rounded'>
                      <div class='flex items-center justify-between mb-1'>
                        <div class='font-mono text-xs text-gray-400'>#{segment.id.slice(0, 8)}</div>
                        <div class='text-xs text-gray-400'>{Math.round(segment.durationMs)}ms</div>
                      </div>
                      <div class='text-sm'>
                        {new Date(segment.startMs).toLocaleTimeString()} -{' '}
                        {new Date(segment.endMs).toLocaleTimeString()}
                      </div>
                    </div>
                  )}
                </For>
              </div>
            }
          >
            <div class='text-gray-500 text-center py-8'>No segments yet</div>
          </Show>
        </div>
      </div>
    </div>
  );
}
