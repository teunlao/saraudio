import type { Logger } from '@saraudio/utils';
import { loadCaptureDarwin } from '../sources/internal/load-capture-darwin';

export type SystemAudioPreflightPermission = 'granted' | 'unknown' | 'not_permitted' | 'failed';

export interface SystemAudioPreflightReport {
  ok: boolean;
  permission: SystemAudioPreflightPermission;
  osStatus: number | null;
  message: string | null;
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

export async function preflightSystemAudioPermission(
  options: PreflightSystemAudioOptions = {},
): Promise<SystemAudioPreflightReport> {
  if (process.platform !== 'darwin') {
    throw new Error(
      `@saraudio/capture-node: preflightSystemAudioPermission is not supported on ${process.platform} yet.`,
    );
  }

  const captureDarwin = await loadCaptureDarwin();
  const preflight = captureDarwin.preflightSystemAudioPermission;
  if (typeof preflight !== 'function') {
    throw new Error(
      [
        'Your installed @saraudio/capture-darwin is missing preflightSystemAudioPermission().',
        'Update to a newer version of @saraudio/capture-darwin and try again.',
      ].join('\n'),
    );
  }

  return await preflight(options);
}
