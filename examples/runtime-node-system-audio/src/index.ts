import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import type { Segment } from '@saraudio/core';
import { encodeWavPcm16 } from '@saraudio/core';
import { createNodeRuntime, type NodeFrameSource } from '@saraudio/runtime-node';
import { createEnergyVadStage } from '@saraudio/vad-energy';

const SAMPLE_RATE = 16000;
const CHANNELS = 1;
const FRAME_SIZE = 160; // 10 ms

const __dirname = dirname(fileURLToPath(import.meta.url));
const segmentsDir = resolve(__dirname, '../.segments');
mkdirSync(segmentsDir, { recursive: true });

const parseEnergyThreshold = (): number => {
  const raw = process.env.ENERGY_THRESHOLD_DB;
  if (!raw) return -55;
  const value = Number(raw);
  return Number.isFinite(value) ? value : -55;
};

const writeSegmentToFile = (segment: Segment, index: number): void => {
  if (!segment.pcm) return;
  const wav = encodeWavPcm16(segment.pcm, { sampleRate: segment.sampleRate, channels: segment.channels });
  const filePath = resolve(segmentsDir, `segment-${index}.wav`);
  writeFileSync(filePath, Buffer.from(wav));
  console.log(`segment saved → ${filePath}`);
};

const main = async () => {
  if (process.platform !== 'darwin') {
    throw new Error('This example is macOS-only (system audio taps require darwin)');
  }

  console.log('Starting CoreAudio system audio capture… Press Ctrl+C to stop.');

  const runtime = createNodeRuntime();
  const pipeline = runtime.createPipeline({
    stages: [
      {
        id: 'vad',
        create: () => createEnergyVadStage({ thresholdDb: parseEnergyThreshold(), smoothMs: 20 }),
      },
    ],
    segmenter: { preRollMs: 150, hangoverMs: 220 },
  });

  let segmentIndex = 0;
  let lastVadLog = 0;

  pipeline.events.on('speechStart', ({ tsMs }) => {
    console.log(`speechStart @ ${tsMs.toFixed(0)} ms`);
  });

  pipeline.events.on('speechEnd', ({ tsMs }) => {
    console.log(`speechEnd @ ${tsMs.toFixed(0)} ms`);
  });

  pipeline.events.on('segment', (segment) => {
    segmentIndex += 1;
    const { startMs, endMs, durationMs } = segment;
    console.log(
      `segment #${segmentIndex} ${startMs.toFixed(0)} → ${endMs.toFixed(0)} (duration ${durationMs.toFixed(0)} ms)`,
    );
    writeSegmentToFile(segment, segmentIndex);
  });

  pipeline.events.on('vad', ({ score, speech, tsMs }) => {
    const now = Date.now();
    if (now - lastVadLog < 120) return;
    lastVadLog = now;
    const active = speech ? '#' : '.';
    const bar = active.repeat(Math.round(score * 20)).padEnd(20, '.');
    readline.cursorTo(process.stdout, 0);
    process.stdout.write(
      `[${bar}] ${speech ? 'speech ' : 'silence'} score=${score.toFixed(2)} ts=${tsMs.toFixed(0)}   `,
    );
  });

  const require = createRequire(import.meta.url);
  const capture: typeof import('@saraudio/capture-darwin') = require('@saraudio/capture-darwin');

  const source: NodeFrameSource = capture.createSystemAudioSource({ frameSize: FRAME_SIZE });

  process.once('SIGINT', () => {
    void source.stop();
  });

  process.once('SIGTERM', () => {
    void source.stop();
  });

  try {
    await runtime.run({ source, pipeline, autoFlush: true });
  } finally {
    pipeline.dispose();
  }
};

main().catch((error) => {
  console.error('Failed to start example:', error);
  process.exit(1);
});
