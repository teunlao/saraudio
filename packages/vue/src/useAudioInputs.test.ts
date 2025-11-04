import { afterEach, describe, expect, it, vi } from 'vitest';
import { withSetup } from './test-utils/withSetup';
import { useAudioInputs } from './useAudioInputs';

// Mock runtime-browser functions
vi.mock('@saraudio/runtime-browser', () => ({
  listAudioInputs: vi.fn(async () => ({
    devices: [
      { deviceId: 'device-1', label: 'Microphone 1', kind: 'audioinput' as const, groupId: '', toJSON: () => ({}) },
      { deviceId: 'device-2', label: 'Microphone 2', kind: 'audioinput' as const, groupId: '', toJSON: () => ({}) },
    ],
  })),
  watchAudioDeviceChanges: vi.fn(() => vi.fn()),
}));

describe('useAudioInputs', () => {
  let apps: ReturnType<typeof withSetup>[1][] = [];

  afterEach(() => {
    for (const app of apps) {
      app.unmount();
    }
    apps = [];
    vi.clearAllMocks();
    // Clear localStorage
    if (typeof window !== 'undefined') {
      window.localStorage.clear();
    }
  });

  it('initializes with default state before mount', () => {
    const [inputs, app] = withSetup(() => useAudioInputs());
    apps.push(app);

    expect(inputs.devices.value).toEqual([]);
    expect(inputs.selectedDeviceId.value).toBe('');
    expect(inputs.error.value).toBe(null);
  });

  it('fetches devices on mount', async () => {
    const [inputs, app] = withSetup(() => useAudioInputs());
    apps.push(app);

    // Wait for async operations
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(inputs.devices.value).toHaveLength(2);
    expect(inputs.devices.value[0]?.deviceId).toBe('device-1');
    expect(inputs.devices.value[1]?.deviceId).toBe('device-2');
  });

  it('auto-selects first device', async () => {
    const [inputs, app] = withSetup(() => useAudioInputs({ autoSelectFirst: true }));
    apps.push(app);

    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(inputs.selectedDeviceId.value).toBe('device-1');
  });

  it('does not auto-select if disabled', async () => {
    const [inputs, app] = withSetup(() => useAudioInputs({ autoSelectFirst: false }));
    apps.push(app);

    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(inputs.selectedDeviceId.value).toBe('');
  });

  it('refreshes device list', async () => {
    const [inputs, app] = withSetup(() => useAudioInputs());
    apps.push(app);

    await inputs.refresh();

    expect(inputs.devices.value).toHaveLength(2);
  });

  it('handles errors during enumeration', async () => {
    const { listAudioInputs } = await import('@saraudio/runtime-browser');
    vi.mocked(listAudioInputs).mockRejectedValueOnce(new Error('Permission denied'));

    const [inputs, app] = withSetup(() => useAudioInputs());
    apps.push(app);

    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(inputs.error.value).toBe('Permission denied');
    expect(inputs.devices.value).toEqual([]);
    expect(inputs.selectedDeviceId.value).toBe('');
  });
});
