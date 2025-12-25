import type { Logger } from '@saraudio/utils';
import { loadCaptureDarwin } from '../sources/internal/load-capture-darwin';

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

export async function listMicrophoneDevices(options: ListMicrophoneDevicesOptions = {}): Promise<MicrophoneDevice[]> {
  if (process.platform !== 'darwin') {
    throw new Error(`@saraudio/capture-node: listMicrophoneDevices is not supported on ${process.platform} yet.`);
  }

  const captureDarwin = await loadCaptureDarwin();
  const list = captureDarwin.listMicrophoneDevices;
  if (typeof list !== 'function') {
    throw new Error(
      [
        'Your installed @saraudio/capture-darwin is missing listMicrophoneDevices().',
        'Update to a newer version of @saraudio/capture-darwin and try again.',
      ].join('\n'),
    );
  }

  return await list(options);
}
