import type { Frame } from '@saraudio/core';
import { createSystemAudioSource, preflightSystemAudioPermission } from '@saraudio/capture-node';

const sleep = async (ms: number): Promise<void> => {
  await new Promise<void>((resolve) => setTimeout(resolve, ms));
};

const parseEnvNumber = (name: string, fallback: number): number => {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const pcmToFloat = (pcm: Frame['pcm'], i: number): number => {
  const value = pcm[i] ?? 0;
  if (pcm instanceof Int16Array) {
    return value / 32768;
  }
  return value;
};

const analyzeFrame = (frame: Frame): { peak: number; rms: number } => {
  let peak = 0;
  let sumSq = 0;

  for (let i = 0; i < frame.pcm.length; i += 1) {
    const x = pcmToFloat(frame.pcm, i);
    const abs = Math.abs(x);
    if (abs > peak) peak = abs;
    sumSq += x * x;
  }

  const rms = frame.pcm.length > 0 ? Math.sqrt(sumSq / frame.pcm.length) : 0;
  return { peak, rms };
};

const main = async () => {
  if (process.platform !== 'darwin') {
    throw new Error('This example is macOS-only (system audio taps require darwin).');
  }

  console.log('=== runtime-node-system-audio-permissions ===');
  console.log('pid:', process.pid);
  console.log('execPath:', process.execPath);
  console.log('cwd:', process.cwd());

  const report = await preflightSystemAudioPermission();
  console.log('preflightSystemAudioPermission():');
  console.log(JSON.stringify(report, null, 2));

  const runCapture = process.env.RUN_CAPTURE !== '0';
  if (!runCapture) return;

  const durationMs = parseEnvNumber('CAPTURE_DURATION_MS', 1500);
  const frameSize = parseEnvNumber('FRAME_SIZE', 160);

  console.log('');
  console.log(`capture probe: durationMs=${durationMs} frameSize=${frameSize}`);

  const source = createSystemAudioSource({ frameSize });
  let frames = 0;
  let peakMax = 0;
  let rmsSum = 0;

  const run = source.start((frame) => {
    frames += 1;
    const { peak, rms } = analyzeFrame(frame);
    if (peak > peakMax) peakMax = peak;
    rmsSum += rms;
  });

  const stop = async () => {
    try {
      await source.stop();
    } catch {}
  };

  process.once('SIGINT', () => {
    void stop();
  });
  process.once('SIGTERM', () => {
    void stop();
  });

  try {
    await sleep(durationMs);
  } finally {
    await stop();
    try {
      await run;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('capture probe error:', message);
    }
  }

  const rmsAvg = frames > 0 ? rmsSum / frames : 0;
  console.log('');
  console.log('capture probe result:');
  console.log(`frames=${frames}`);
  console.log(`peakMax=${peakMax.toFixed(4)}`);
  console.log(`rmsAvg=${rmsAvg.toFixed(4)}`);
};

main().catch((error) => {
  console.error('Failed to run example:', error);
  process.exit(1);
});

