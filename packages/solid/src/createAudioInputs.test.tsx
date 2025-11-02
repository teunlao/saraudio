import { render } from '@solidjs/testing-library';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAudioInputs } from './createAudioInputs';

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
  afterEach(() => {
    vi.clearAllMocks();
    if (typeof window !== 'undefined') {
      window.localStorage.clear();
    }
  });

  it('initializes with default state before mount', () => {
    const TestComponent = () => {
      const inputs = createAudioInputs();
      expect(inputs.devices()).toEqual([]);
      expect(inputs.selectedDeviceId()).toBe('');
      expect(inputs.error()).toBe(null);
      return null;
    };

    render(() => <TestComponent />);
  });

  it('fetches devices on mount', async () => {
    const TestComponent = () => {
      const inputs = createAudioInputs();

      setTimeout(() => {
        expect(inputs.devices()).toHaveLength(2);
        expect(inputs.devices()[0]?.deviceId).toBe('device-1');
        expect(inputs.devices()[1]?.deviceId).toBe('device-2');
      }, 50);

      return null;
    };

    render(() => <TestComponent />);
    await new Promise((resolve) => setTimeout(resolve, 100));
  });

  it('auto-selects first device', async () => {
    const TestComponent = () => {
      const inputs = createAudioInputs({ autoSelectFirst: true });

      setTimeout(() => {
        expect(inputs.selectedDeviceId()).toBe('device-1');
      }, 50);

      return null;
    };

    render(() => <TestComponent />);
    await new Promise((resolve) => setTimeout(resolve, 100));
  });

  it('does not auto-select if disabled', async () => {
    const TestComponent = () => {
      const inputs = createAudioInputs({ autoSelectFirst: false });

      setTimeout(() => {
        expect(inputs.selectedDeviceId()).toBe('');
      }, 50);

      return null;
    };

    render(() => <TestComponent />);
    await new Promise((resolve) => setTimeout(resolve, 100));
  });

  it('refreshes device list', async () => {
    const TestComponent = () => {
      const inputs = createAudioInputs();

      setTimeout(() => {
        inputs.refresh().then(() => {
          expect(inputs.devices()).toHaveLength(2);
        });
      }, 50);

      return null;
    };

    render(() => <TestComponent />);
    await new Promise((resolve) => setTimeout(resolve, 100));
  });

  it('handles errors during enumeration', async () => {
    const { listAudioInputs } = await import('@saraudio/runtime-browser');
    vi.mocked(listAudioInputs).mockRejectedValueOnce(new Error('Permission denied'));

    const TestComponent = () => {
      const inputs = createAudioInputs();

      setTimeout(() => {
        expect(inputs.error()).toBe('Permission denied');
        expect(inputs.devices()).toEqual([]);
        expect(inputs.selectedDeviceId()).toBe('');
      }, 50);

      return null;
    };

    render(() => <TestComponent />);
    await new Promise((resolve) => setTimeout(resolve, 100));
  });
});
