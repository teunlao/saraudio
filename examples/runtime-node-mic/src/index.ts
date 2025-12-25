import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import readline from 'node:readline';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import type { Segment } from '@saraudio/core';
import { createNodeRuntime, type NodeFrameSource } from '@saraudio/runtime-node';
import { createEnergyVadStage } from '@saraudio/vad-energy';

const SAMPLE_RATE = 16000;
const CHANNELS = 1;
const FRAME_SIZE = 160; // 10 ms

const __dirname = dirname(fileURLToPath(import.meta.url));
const segmentsDir = resolve(__dirname, '../.segments');
mkdirSync(segmentsDir, { recursive: true });

interface InputConfig {
  args: string[];
  description: string;
}

interface ListedDevice {
  index: number;
  name: string;
}

const parseEnergyThreshold = (): number => {
  const raw = process.env.ENERGY_THRESHOLD_DB;
  if (!raw) return -55;
  const value = Number(raw);
  return Number.isFinite(value) ? value : -55;
};

const listAvfoundationAudioDevices = (): ListedDevice[] => {
  const result = spawnSync('ffmpeg', ['-hide_banner', '-f', 'avfoundation', '-list_devices', 'true', '-i', ''], {
    encoding: 'utf8',
  });
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  const lines = output.split('\n');
  const devices: ListedDevice[] = [];
  let inAudioSection = false;
  const regex = /^\[AVFoundation[^\]]*\]\s*\[(\d+)\]\s(.+)$/;
  for (const line of lines) {
    if (line.includes('AVFoundation audio devices:')) {
      inAudioSection = true;
      continue;
    }
    if (line.includes('AVFoundation video devices:')) {
      inAudioSection = false;
    }
    if (!inAudioSection) continue;
    const match = line.match(regex);
    if (match) {
      devices.push({ index: Number(match[1]), name: match[2].trim() });
    }
  }
  return devices;
};

const promptForAudioDevice = async (devices: ListedDevice[]): Promise<number | null> => {
  if (!process.stdin.isTTY || devices.length === 0) return null;
  console.log('Available audio devices (avfoundation):');
  devices.forEach(({ index, name }) => {
    console.log(`  [${index}] ${name}`);
  });
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question('Select audio device index (Enter for default :0): ');
  rl.close();
  const trimmed = answer.trim();
  if (trimmed === '') return null;
  const parsed = Number(trimmed);
  if (Number.isFinite(parsed)) return parsed;
  console.warn(`Cannot parse "${answer}" as device index. Using default :0.`);
  return null;
};

const resolveInputConfig = async (): Promise<InputConfig> => {
  const rawJson = process.env.FFMPEG_INPUT_ARGS;
  if (rawJson) {
    try {
      const parsed = JSON.parse(rawJson);
      if (Array.isArray(parsed) && parsed.every((value) => typeof value === 'string')) {
        return {
          args: parsed,
          description: `custom args ${JSON.stringify(parsed)}`,
        };
      }
      console.warn('FFMPEG_INPUT_ARGS must be a JSON array of strings. Using default values.');
    } catch (error) {
      console.warn('Failed to parse FFMPEG_INPUT_ARGS. Using default values.', error);
    }
  }

  const platform = process.platform;
  if (platform === 'darwin') {
    const envDevice = process.env.FFMPEG_DEVICE;
    if (envDevice) {
      return {
        args: ['-f', 'avfoundation', '-i', envDevice],
        description: `avfoundation device ${envDevice}`,
      };
    }
    const devices = listAvfoundationAudioDevices();
    const selected = await promptForAudioDevice(devices);
    const device = selected !== null ? `:${selected}` : ':0';
    return {
      args: ['-f', 'avfoundation', '-i', device],
      description: `avfoundation device ${device}`,
    };
  }
  if (platform === 'linux') {
    const device = process.env.FFMPEG_DEVICE ?? 'default';
    return {
      args: ['-f', 'alsa', '-i', device],
      description: `alsa device ${device}`,
    };
  }
  if (platform === 'win32') {
    const device = process.env.FFMPEG_DEVICE;
    if (!device) {
      throw new Error('For Windows, specify FFMPEG_DEVICE environment variable, e.g. audio="Microphone (USB)"');
    }
    return {
      args: ['-f', 'dshow', '-i', `audio=${device}`],
      description: `dshow device ${device}`,
    };
  }
  throw new Error(`Unknown platform ${platform}. Set FFMPEG_INPUT_ARGS manually.`);
};

const createFfmpegProcess = (inputConfig: InputConfig) => {
  const commonArgs = ['-ac', String(CHANNELS), '-ar', String(SAMPLE_RATE), '-f', 's16le', '-'];
  const args = [...inputConfig.args, ...commonArgs];
  console.log(`Using input device: ${inputConfig.description}`);
  const ffmpeg = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] });

  ffmpeg.stderr.setEncoding('utf8');
  ffmpeg.stderr.on('data', (chunk) => {
    process.stderr.write(chunk);
  });

  ffmpeg.on('error', (error) => {
    console.error('Failed to start ffmpeg:', error);
    process.exit(1);
  });

  return ffmpeg;
};

const writeSegmentToFile = (segment: Segment, index: number): void => {
  if (!segment.pcm) return;
  const buffer = Buffer.from(segment.pcm.buffer, segment.pcm.byteOffset, segment.pcm.byteLength);
  const filePath = resolve(segmentsDir, `segment-${index}.pcm`);
  writeFileSync(filePath, buffer);
  console.log(`segment saved → ${filePath}`);
};

const main = async () => {
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

  let source: NodeFrameSource;
  let stopCapture: (() => Promise<void>) | null = null;

  if (process.platform === 'darwin') {
    console.log('Starting CoreAudio microphone capture… Press Ctrl+C to stop.');
    const require = createRequire(import.meta.url);
    const capture: typeof import('@saraudio/capture-darwin') = require('@saraudio/capture-darwin');
    source = capture.createMicrophoneSource({ frameSize: FRAME_SIZE });
    stopCapture = async () => {
      await source.stop();
    };
  } else {
    console.log('Starting ffmpeg… Press Ctrl+C to stop.');
    const inputConfig = await resolveInputConfig();
    const ffmpeg = createFfmpegProcess(inputConfig);

    stopCapture = async () => {
      ffmpeg.kill('SIGINT');
    };

    source = runtime.createPcm16StreamSource({
      stream: ffmpeg.stdout,
      sampleRate: SAMPLE_RATE,
      channels: CHANNELS,
      frameSize: FRAME_SIZE,
    });
  }

  process.once('SIGINT', () => {
    void stopCapture?.();
  });

  process.once('SIGTERM', () => {
    void stopCapture?.();
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
