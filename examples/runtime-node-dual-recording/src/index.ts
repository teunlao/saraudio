import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createInterface } from 'node:readline/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { encodeWavPcm16, type Frame } from '@saraudio/core';
import { createLogger } from '@saraudio/utils';
import type { NodeFrameSource } from '@saraudio/capture-darwin';

const SAMPLE_RATE = 16000;
const CHANNELS = 1;
const FRAME_SIZE = 160; // 10ms @ 16kHz

type Mode = 'dual' | 'mic' | 'system';

const parseMode = (): Mode => {
  const raw = process.env.MODE?.trim().toLowerCase();
  if (!raw) return 'dual';
  if (raw === 'dual' || raw === 'mic' || raw === 'system') return raw;
  return 'dual';
};

const concatPcm = (chunks: Int16Array[], totalSamples: number): Int16Array => {
  const out = new Int16Array(totalSamples);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
};

const main = async () => {
  if (process.platform !== 'darwin') {
    throw new Error('This example is macOS-only (uses @saraudio/capture-darwin)');
  }

  const __dirname = dirname(fileURLToPath(import.meta.url));
  const outDir = resolve(__dirname, '../.recordings');
  mkdirSync(outDir, { recursive: true });

  const mode = parseMode();
  const logger = createLogger({ namespace: 'example:dual', level: 'info' });
  const require = createRequire(import.meta.url);
  const capture: typeof import('@saraudio/capture-darwin') = require('@saraudio/capture-darwin');

  const micChunks: Int16Array[] = [];
  const sysChunks: Int16Array[] = [];
  let micSamples = 0;
  let sysSamples = 0;

  const onMicFrame = (frame: Frame) => {
    const copy = new Int16Array(frame.pcm);
    micChunks.push(copy);
    micSamples += copy.length;
  };

  const onSysFrame = (frame: Frame) => {
    const copy = new Int16Array(frame.pcm);
    sysChunks.push(copy);
    sysSamples += copy.length;
  };

  const sources: Array<{ name: string; source: NodeFrameSource; onFrame: (frame: Frame) => void }> = [];

  if (mode === 'dual' || mode === 'mic') {
    sources.push({
      name: 'mic',
      source: capture.createMicrophoneSource({ frameSize: FRAME_SIZE, logger }),
      onFrame: onMicFrame,
    });
  }

  if (mode === 'dual' || mode === 'system') {
    sources.push({
      name: 'system',
      source: capture.createSystemAudioSource({ frameSize: FRAME_SIZE, logger }),
      onFrame: onSysFrame,
    });
  }

  console.log(`Recording mode=${mode}. Type "stop" + Enter, or press Ctrl+C to finish.`);

  const startPromises = sources.map(({ name, source, onFrame }) =>
    source.start(onFrame).catch((error: unknown) => {
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error(`source ${name} failed`, { error: err.message });
      throw err;
    }),
  );

  let stopping = false;
  const stopAll = async (): Promise<void> => {
    if (stopping) return;
    stopping = true;
    await Promise.allSettled(sources.map(({ source }) => source.stop()));
  };

  process.once('SIGINT', () => {
    void stopAll();
  });
  process.once('SIGTERM', () => {
    void stopAll();
  });

  if (process.stdin.isTTY) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    try {
      // Keep reading until user types stop/exit.
      while (!stopping) {
        const line = (await rl.question('> ')).trim().toLowerCase();
        if (line === 'stop' || line === 'exit' || line === 'quit' || line === 'q') {
          await stopAll();
          break;
        }
      }
    } finally {
      rl.close();
    }
  } else {
    // Non-interactive: record for a short default duration unless overridden.
    const durationSec = Number(process.env.DURATION_SEC ?? '10');
    const safeDurationSec = Number.isFinite(durationSec) && durationSec > 0 ? durationSec : 10;
    await new Promise<void>((resolve) => {
      setTimeout(() => resolve(), safeDurationSec * 1000);
    });
    await stopAll();
  }

  await Promise.allSettled(startPromises);

  const stamp = new Date().toISOString().split(':').join('-');

  if (micSamples > 0) {
    const pcm = concatPcm(micChunks, micSamples);
    const wav = encodeWavPcm16(pcm, { sampleRate: SAMPLE_RATE, channels: CHANNELS });
    const path = resolve(outDir, `${stamp}-mic.wav`);
    writeFileSync(path, Buffer.from(wav));
    console.log(`saved mic → ${path}`);
  } else if (mode === 'dual' || mode === 'mic') {
    console.log('mic: no samples captured');
  }

  if (sysSamples > 0) {
    const pcm = concatPcm(sysChunks, sysSamples);
    const wav = encodeWavPcm16(pcm, { sampleRate: SAMPLE_RATE, channels: CHANNELS });
    const path = resolve(outDir, `${stamp}-system.wav`);
    writeFileSync(path, Buffer.from(wav));
    console.log(`saved system → ${path}`);
  } else if (mode === 'dual' || mode === 'system') {
    console.log('system: no samples captured');
  }
};

main().catch((error: unknown) => {
  const err = error instanceof Error ? error : new Error(String(error));
  console.error('Failed to start example:', err);
  process.exit(1);
});
