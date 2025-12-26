import readline from 'node:readline';
import { createMicrophoneSource, createSystemAudioSource, listMicrophoneDevices } from '@saraudio/capture-node';
import { deepgram } from '@saraudio/deepgram';
import { createRecorder, createTranscription } from '@saraudio/runtime-node';
import { soniox } from '@saraudio/soniox';

type SourceKind = 'mic' | 'system';
type ProviderKind = 'deepgram' | 'soniox';
type LogLevel = 'error' | 'warn' | 'info' | 'debug';

type CliOptions = {
  help: boolean;
  listMics: boolean;
  source: SourceKind;
  provider: ProviderKind;
  micDeviceUID?: string;
  logLevel?: LogLevel;
};

const FRAME_SIZE = 160; // 10ms @ 16kHz
const SAMPLE_RATE = 16_000;
const CHANNELS = 1;

const readEnv = (name: string): string | undefined => {
  const raw = process.env[name];
  const trimmed = typeof raw === 'string' ? raw.trim() : '';
  return trimmed.length > 0 ? trimmed : undefined;
};

const requireEnv = (name: string): string => {
  const value = readEnv(name);
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
};

const parseArgs = (argv: string[]): CliOptions => {
  const getFlag = (name: string): boolean => argv.includes(name);
  const getValue = (name: string): string | undefined => {
    const idx = argv.indexOf(name);
    if (idx === -1) return undefined;
    const next = argv[idx + 1];
    if (!next || next.startsWith('-')) return undefined;
    return next;
  };

  const help = getFlag('--help') || getFlag('-h');
  const listMics = getFlag('--list-mics');

  const sourceRaw = (getValue('--source') ?? readEnv('SARAUDIO_SOURCE') ?? 'mic').toLowerCase();
  const providerRaw = (getValue('--provider') ?? readEnv('SARAUDIO_PROVIDER') ?? 'deepgram').toLowerCase();

  const source: SourceKind = sourceRaw === 'system' ? 'system' : 'mic';
  const provider: ProviderKind = providerRaw === 'soniox' ? 'soniox' : 'deepgram';

  const micDeviceUID = getValue('--device-uid') ?? readEnv('SARAUDIO_MIC_DEVICE_UID');
  const logLevelRaw = (getValue('--log-level') ?? readEnv('SARAUDIO_LOG_LEVEL') ?? '').toLowerCase();
  const logLevel: LogLevel | undefined =
    logLevelRaw === 'debug'
      ? 'debug'
      : logLevelRaw === 'info'
        ? 'info'
        : logLevelRaw === 'warn'
          ? 'warn'
          : logLevelRaw === 'error'
            ? 'error'
            : undefined;

  return { help, listMics, source, provider, micDeviceUID, logLevel };
};

const printHelp = (): void => {
  console.log(`
@saraudio/example-runtime-node-transcribe

Usage:
  pnpm --filter @saraudio/example-runtime-node-transcribe start -- [options]

Options:
  --source mic|system         Capture source (default: mic)
  --provider deepgram|soniox  Transcription provider (default: deepgram)
  --device-uid <uid>          CoreAudio device UID for mic (optional)
  --list-mics                 Print available microphone devices (UIDs)
  --log-level error|warn|info|debug
  -h, --help

Environment:
  DEEPGRAM_API_KEY            Required for --provider deepgram
  SONIOX_API_KEY              Required for --provider soniox
  SARAUDIO_SOURCE             Default source when --source not provided
  SARAUDIO_PROVIDER           Default provider when --provider not provided
  SARAUDIO_MIC_DEVICE_UID     Default mic device UID
  SARAUDIO_LOG_LEVEL          Default log level for runtime-base
`);
};

const main = async (): Promise<void> => {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    printHelp();
    return;
  }

  if (opts.listMics) {
    const devices = await listMicrophoneDevices();
    if (devices.length === 0) {
      console.log('No microphone devices found.');
      return;
    }
    console.log('Microphone devices:');
    for (const d of devices) {
      console.log(`- id=${d.id} name="${d.name}" uid="${d.uid}"`);
    }
    return;
  }

  const source =
    opts.source === 'mic'
      ? createMicrophoneSource({ frameSize: FRAME_SIZE, deviceUID: opts.micDeviceUID })
      : createSystemAudioSource({ frameSize: FRAME_SIZE });

  const provider =
    opts.provider === 'deepgram'
      ? deepgram({
          auth: { apiKey: requireEnv('DEEPGRAM_API_KEY') },
          model: 'nova-3',
          interimResults: true,
        })
      : soniox({
          auth: { apiKey: requireEnv('SONIOX_API_KEY') },
          model: 'stt-rt-v3',
        });

  const recorder = createRecorder({
    source,
    segmenter: false,
    format: { encoding: 'pcm16', sampleRate: SAMPLE_RATE, channels: CHANNELS },
  });

  const controller = createTranscription({
    provider,
    recorder,
    transport: 'websocket',
    logger: opts.logLevel,
  });

  const isTTY = !!process.stdout.isTTY;
  const clearPartial = (): void => {
    if (!isTTY) return;
    readline.clearLine(process.stdout, 0);
    readline.cursorTo(process.stdout, 0);
  };

  const printLine = (line: string): void => {
    clearPartial();
    console.log(line);
  };

  controller.onStatusChange((status) => {
    printLine(`[status] ${status}`);
  });

  controller.onError((error) => {
    printLine(`[error] ${error.message}`);
  });

  controller.onPartial((text) => {
    if (!isTTY) return;
    clearPartial();
    process.stdout.write(`… ${text}`);
  });

  controller.onTranscript((result) => {
    printLine(result.text);
  });

  const stop = async (): Promise<void> => {
    try {
      await controller.disconnect();
    } finally {
      await recorder.stop().catch(() => undefined);
      recorder.dispose();
    }
  };

  process.once('SIGINT', () => {
    void stop().finally(() => process.exit(0));
  });

  process.once('SIGTERM', () => {
    void stop().finally(() => process.exit(0));
  });

  printLine(`[start] source=${opts.source} provider=${opts.provider} transport=websocket`);
  await controller.connect();
  await recorder.start();

  // keep running until signal
  await new Promise<void>(() => undefined);
};

main().catch((error) => {
  console.error('Failed to start transcription example:', error);
  process.exit(1);
});
