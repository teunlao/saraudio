import type { ListMicrophoneDevicesOptions, MicrophoneDevice } from '../../devices/microphone-devices';
import type { NodeFrameSource } from '../../types';
import type { MicrophoneSourceOptions, SystemAudioSourceOptions } from '../types';

export interface CaptureDarwinExports {
  createMicrophoneSource: (options?: MicrophoneSourceOptions) => NodeFrameSource;
  createSystemAudioSource: (options?: SystemAudioSourceOptions) => NodeFrameSource;
  listMicrophoneDevices?: (options?: ListMicrophoneDevicesOptions) => Promise<MicrophoneDevice[]>;
}

const isObject = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null;
};

const isCaptureDarwinExports = (value: unknown): value is CaptureDarwinExports => {
  if (!isObject(value)) return false;
  const maybe = value as Record<string, unknown>;
  return typeof maybe.createMicrophoneSource === 'function' && typeof maybe.createSystemAudioSource === 'function';
};

export async function loadCaptureDarwin(): Promise<CaptureDarwinExports> {
  const moduleName: string = '@saraudio/capture-darwin';

  let mod: unknown;
  try {
    mod = await import(moduleName);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      [
        `Failed to load ${moduleName}.`,
        'This package is required on macOS to capture system audio and microphone input.',
        'Try installing it explicitly: pnpm add @saraudio/capture-darwin',
        '',
        message,
      ].join('\n'),
    );
  }

  if (isCaptureDarwinExports(mod)) return mod;
  if (isObject(mod) && isCaptureDarwinExports(mod.default)) return mod.default;

  throw new Error(`Invalid ${moduleName} module shape (expected createMicrophoneSource/createSystemAudioSource).`);
}
