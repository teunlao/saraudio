import { flushSync } from 'svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAudioInputs } from './createAudioInputs.svelte';

// Mock runtime-browser functions
vi.mock('@saraudio/runtime-browser', () => ({
  listAudioInputs: vi.fn(async () => ({
    devices: [
      { deviceId: 'device-1', label: 'Microphone 1', kind: 'audioinput' as const, groupId: '', toJSON: () => ({}) },
      { deviceId: 'device-2', label: 'Microphone 2', kind: 'audioinput' as const, groupId: '', toJSON: () => ({}) },
    ],
  })),
  watchAudioDeviceChanges: vi.fn(() => ({
    unsubscribe: vi.fn(),
  })),
}));

describe('createAudioInputs', () => {
  let cleanup: (() => void) | undefined;

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
    vi.clearAllMocks();
    if (typeof window !== 'undefined') {
      window.localStorage.clear();
    }
  });

  it('initializes with default state before mount', () => {
    cleanup = $effect.root(() => {
      const inputs = createAudioInputs();

      expect(inputs.devices).toEqual([]);
      expect(inputs.selectedDeviceId).toBe('');
      expect(inputs.error).toBe(null);
    });
  });

  it('fetches devices on mount', async () => {
    cleanup = $effect.root(() => {
      const inputs = createAudioInputs();

      setTimeout(() => {
        flushSync();
        expect(inputs.devices).toHaveLength(2);
        expect(inputs.devices[0]?.deviceId).toBe('device-1');
        expect(inputs.devices[1]?.deviceId).toBe('device-2');
      }, 50);
    });
  });

  it('auto-selects first device', async () => {
    cleanup = $effect.root(() => {
      const inputs = createAudioInputs({ autoSelectFirst: true });

      setTimeout(() => {
        flushSync();
        expect(inputs.selectedDeviceId).toBe('device-1');
      }, 50);
    });
  });

  it('does not auto-select if disabled', async () => {
    cleanup = $effect.root(() => {
      const inputs = createAudioInputs({ autoSelectFirst: false });

      setTimeout(() => {
        flushSync();
        expect(inputs.selectedDeviceId).toBe('');
      }, 50);
    });
  });

  it('refreshes device list', async () => {
    cleanup = $effect.root(() => {
      const inputs = createAudioInputs();

      inputs.refresh().then(() => {
        flushSync();
        expect(inputs.devices).toHaveLength(2);
      });
    });
  });

  it('handles errors during enumeration', async () => {
    const { listAudioInputs } = await import('@saraudio/runtime-browser');
    vi.mocked(listAudioInputs).mockRejectedValueOnce(new Error('Permission denied'));

    cleanup = $effect.root(() => {
      const inputs = createAudioInputs();

      setTimeout(() => {
        flushSync();
        expect(inputs.error).toBe('Permission denied');
        expect(inputs.devices).toEqual([]);
        expect(inputs.selectedDeviceId).toBe('');
      }, 50);
    });
  });
});
