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

export type SystemAudioPreflightPermission = 'granted' | 'unknown' | 'not_permitted' | 'failed';

export interface SystemAudioPreflightReport {
  ok: boolean;
  permission: SystemAudioPreflightPermission;
  osStatus: number | null;
  message: string | null;
  /**
   * Raw numeric value returned by the private TCC preflight call.
   * Used for debugging discrepancies between OS settings and observed behavior.
   */
  tccPreflight: number | null;
}

export interface PreflightSystemAudioOptions {
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

const isSystemAudioPreflightPermission = (value: unknown): value is SystemAudioPreflightPermission => {
  return value === 'granted' || value === 'unknown' || value === 'not_permitted' || value === 'failed';
};

const parseSystemAudioPreflightJson = (raw: string): SystemAudioPreflightReport => {
  const parsed: unknown = JSON.parse(raw);
  if (!isObject(parsed)) {
    throw new Error('Expected JSON object');
  }

  const { ok, permission, osStatus, message, tccPreflight } = parsed;
  if (typeof ok !== 'boolean') {
    throw new Error('Invalid ok');
  }
  if (!isSystemAudioPreflightPermission(permission)) {
    throw new Error('Invalid permission');
  }

  const parsedOsStatus =
    typeof osStatus === 'number' && Number.isFinite(osStatus) ? osStatus : osStatus === null ? null : null;
  const parsedMessage = typeof message === 'string' ? message : message === null ? null : null;
  const parsedTccPreflight =
    typeof tccPreflight === 'number' && Number.isFinite(tccPreflight)
      ? tccPreflight
      : tccPreflight === null
        ? null
        : null;

  return {
    ok,
    permission,
    osStatus: parsedOsStatus,
    message: parsedMessage,
    tccPreflight: parsedTccPreflight,
  };
};

export async function preflightSystemAudioPermission(
  options: PreflightSystemAudioOptions = {},
): Promise<SystemAudioPreflightReport> {
  if (process.platform !== 'darwin') {
    throw new Error('preflightSystemAudioPermission is only supported on macOS (darwin)');
  }

  const logger = options.logger ?? defaultLogger;
  const packageRoot = resolvePackageRoot();
  const binaryPath = options.binaryPath ?? resolveBundledBinaryPath(packageRoot);

  const child = spawn(binaryPath, ['--preflight-system-audio'], { stdio: ['ignore', 'pipe', 'pipe'] });
  const stdout = child.stdout;
  const stderr = child.stderr;
  if (!stdout || !stderr) {
    throw new Error('capture process did not provide stdout/stderr streams');
  }

  const rl = createInterface({ input: stderr });
  rl.on('line', (line) => handleStderrLine(logger, line));

  return await new Promise<SystemAudioPreflightReport>((resolve, reject) => {
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

      try {
        const report = parseSystemAudioPreflightJson(raw);
        if (report.ok && code !== 0) {
          reject(
            new Error(
              `System audio preflight reported ok=true but exited non-zero (code=${code ?? 'null'} signal=${
                signal ?? 'null'
              }). stdout:\n${raw}`,
            ),
          );
          return;
        }
        resolve(report);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        reject(
          new Error(
            `Failed to parse system audio preflight JSON (code=${code ?? 'null'} signal=${signal ?? 'null'}).\n${message}\n\nstdout:\n${raw}`,
          ),
        );
      }
    });
  });
}
