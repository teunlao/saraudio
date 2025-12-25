import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { createLogger, type Logger } from '@saraudio/utils';
import { resolveBundledBinaryPath } from '../sources/internal/resolve-binary-path';
import { handleStderrLine } from '../sources/internal/stderr-json';

const defaultLogger = createLogger({ namespace: 'saraudio:capture-darwin', level: 'warn' });

const resolvePackageRoot = (): string => {
  return join(__dirname, '..');
};

export interface MicrophoneDevice {
  id: number;
  uid: string;
  name: string;
}

export interface ListMicrophoneDevicesOptions {
  /**
   * Override path to the packaged capture binary.
   * Intended for development/testing only.
   */
  binaryPath?: string;
  /**
   * Optional logger for capture process stderr messages.
   */
  logger?: Logger;
}

const isObject = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null;
};

const isMicrophoneDevice = (value: unknown): value is MicrophoneDevice => {
  if (!isObject(value)) return false;
  const { id, uid, name } = value;
  return (
    typeof id === 'number' &&
    Number.isFinite(id) &&
    typeof uid === 'string' &&
    uid.length > 0 &&
    typeof name === 'string' &&
    name.length > 0
  );
};

const parseMicrophoneDevicesJson = (raw: string): MicrophoneDevice[] => {
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error('Expected JSON array');
  }
  const devices: MicrophoneDevice[] = [];
  for (const item of parsed) {
    if (!isMicrophoneDevice(item)) {
      throw new Error('Invalid device entry');
    }
    devices.push(item);
  }
  return devices;
};

export async function listMicrophoneDevices(options: ListMicrophoneDevicesOptions = {}): Promise<MicrophoneDevice[]> {
  if (process.platform !== 'darwin') {
    throw new Error('listMicrophoneDevices is only supported on macOS (darwin)');
  }

  const logger = options.logger ?? defaultLogger;
  const packageRoot = resolvePackageRoot();
  const binaryPath = options.binaryPath ?? resolveBundledBinaryPath(packageRoot);

  const child = spawn(binaryPath, ['--list-input-devices'], { stdio: ['ignore', 'pipe', 'pipe'] });
  const stdout = child.stdout;
  const stderr = child.stderr;
  if (!stdout || !stderr) {
    throw new Error('capture process did not provide stdout/stderr streams');
  }

  const rl = createInterface({ input: stderr });
  rl.on('line', (line) => handleStderrLine(logger, line));

  return await new Promise<MicrophoneDevice[]>((resolve, reject) => {
    const stdoutChunks: Buffer[] = [];

    stdout.on('data', (chunk: Buffer) => {
      stdoutChunks.push(Buffer.from(chunk));
    });

    child.on('error', (error) => {
      rl.close();
      reject(error);
    });

    child.once('exit', (code, signal) => {
      rl.close();
      const raw = Buffer.concat(stdoutChunks).toString('utf8').trim();

      if (code !== 0) {
        reject(
          new Error(`Failed to list microphones (code=${code ?? 'null'} signal=${signal ?? 'null'}). stdout:\n${raw}`),
        );
        return;
      }

      try {
        resolve(parseMicrophoneDevicesJson(raw));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        reject(new Error(`Failed to parse microphone list JSON.\n${message}\n\nstdout:\n${raw}`));
      }
    });
  });
}
