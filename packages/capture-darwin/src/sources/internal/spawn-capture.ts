import { spawn } from 'node:child_process';
import type { Readable } from 'node:stream';
import type { Logger } from '@saraudio/utils';

export interface SpawnCaptureResult {
  stdout: Readable;
  stderr: Readable;
  stop: () => Promise<void>;
}

export function spawnCapture(binaryPath: string, args: string[], logger: Logger): SpawnCaptureResult {
  const child = spawn(binaryPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });

  const stdout = child.stdout;
  const stderr = child.stderr;
  if (!stdout || !stderr) {
    throw new Error('capture process did not provide stdout/stderr streams');
  }

  let stopRequested = false;

  child.on('error', (error) => {
    logger.error('capture process error', { error });
    stdout.destroy(error);
  });

  child.once('exit', (code, signal) => {
    if (stopRequested) return;
    const message = `capture process exited unexpectedly (code=${code ?? 'null'} signal=${signal ?? 'null'})`;
    logger.error(message);
    stdout.destroy(new Error(message));
  });

  const stop = async (): Promise<void> => {
    if (child.killed) return;
    stopRequested = true;
    logger.debug('stopping capture process');
    // SIGINT is the least destructive option; if the process ignores it we still rely on stream close.
    try {
      child.kill('SIGINT');
    } catch {}
  };

  return { stdout, stderr, stop };
}
