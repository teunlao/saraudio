import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { noopLogger } from '@saraudio/utils';
import type { NodeFrameSource } from '../types';
import { createPcm16StreamSource } from './internal/pcm16-stream-source';
import { resolveBundledBinaryPath } from './internal/resolve-binary-path';
import { spawnCapture } from './internal/spawn-capture';
import { handleStderrLine } from './internal/stderr-json';
import type { SystemAudioSourceOptions } from './types';

const SAMPLE_RATE = 16000;
const CHANNELS = 1 as const;

const resolvePackageRoot = (): string => {
  return join(__dirname, '..');
};

export function createSystemAudioSource(options: SystemAudioSourceOptions = {}): NodeFrameSource {
  const logger = options.logger ?? noopLogger;
  const frameSize = options.frameSize ?? 160;

  let active = false;
  let stopChild: (() => Promise<void>) | null = null;
  let stopInner: (() => Promise<void>) | null = null;

  return {
    async start(onFrame) {
      if (process.platform !== 'darwin') {
        throw new Error('createSystemAudioSource is only supported on macOS (darwin)');
      }
      if (active) {
        throw new Error('System audio source already started');
      }
      active = true;

      const packageRoot = resolvePackageRoot();
      const binaryPath = options.binaryPath ?? resolveBundledBinaryPath(packageRoot);

      // Keep args minimal; the vendored binary output is fixed to pcm16/16k/mono.
      const args = ['--source', 'system'];

      const { stdout, stderr, stop } = spawnCapture(binaryPath, args, logger);
      stopChild = stop;

      const rl = createInterface({ input: stderr });
      rl.on('line', (line) => handleStderrLine(logger, line));

      const inner = createPcm16StreamSource({
        stream: stdout,
        sampleRate: SAMPLE_RATE,
        channels: CHANNELS,
        frameSize,
      });
      stopInner = async () => {
        rl.close();
        await inner.stop();
      };

      try {
        await inner.start(onFrame);
      } finally {
        rl.close();
        stopInner = null;
        stopChild = null;
        active = false;
      }
    },
    async stop() {
      if (!active) return;
      // First, stop process; then stop the inner framing.
      await stopChild?.();
      await stopInner?.();
      stopChild = null;
      stopInner = null;
      active = false;
    },
  };
}
