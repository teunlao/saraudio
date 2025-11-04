import * as runtime from '@saraudio/runtime-browser';
import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useAudioInputs } from './useAudioInputs';

describe('useAudioInputs', () => {
  afterEach(() => {
    vi.clearAllMocks();
    if (typeof window !== 'undefined') {
      window.localStorage.clear();
    }
  });

  it('initializes with default state before mount', () => {
    const listSpy = vi.spyOn(runtime, 'listAudioInputs').mockImplementation(() => new Promise(() => {}));
    const watchSpy = vi.spyOn(runtime, 'watchAudioDeviceChanges').mockReturnValue(vi.fn());

    const { result } = renderHook(() => useAudioInputs());

    expect(result.current.devices).toEqual([]);
    expect(result.current.selectedDeviceId).toBe('');
    expect(result.current.error).toBe(null);

    listSpy.mockRestore();
    watchSpy.mockRestore();
  });

  it('fetches devices on mount', async () => {
    const devices = [
      { kind: 'audioinput', deviceId: 'device-1', label: 'Microphone 1' },
      { kind: 'audioinput', deviceId: 'device-2', label: 'Microphone 2' },
    ] as MediaDeviceInfo[];

    const listSpy = vi.spyOn(runtime, 'listAudioInputs').mockResolvedValue({
      devices,
      permission: 'granted',
    });
    const watchSpy = vi.spyOn(runtime, 'watchAudioDeviceChanges').mockReturnValue(vi.fn());

    const { result } = renderHook(() => useAudioInputs());

    await waitFor(() => expect(result.current.enumerating).toBe(false));
    expect(result.current.devices.length).toBe(2);
    expect(result.current.devices[0]?.deviceId).toBe('device-1');
    expect(result.current.devices[1]?.deviceId).toBe('device-2');

    listSpy.mockRestore();
    watchSpy.mockRestore();
  });

  it('auto-selects first device', async () => {
    const devices = [
      { kind: 'audioinput', deviceId: 'device-1', label: 'Microphone 1' },
      { kind: 'audioinput', deviceId: 'device-2', label: 'Microphone 2' },
    ] as MediaDeviceInfo[];

    const listSpy = vi.spyOn(runtime, 'listAudioInputs').mockResolvedValue({
      devices,
      permission: 'granted',
    });
    const watchSpy = vi.spyOn(runtime, 'watchAudioDeviceChanges').mockReturnValue(vi.fn());

    const { result } = renderHook(() => useAudioInputs({ autoSelectFirst: true }));

    await waitFor(() => expect(result.current.enumerating).toBe(false));
    expect(result.current.selectedDeviceId).toBe('device-1');

    listSpy.mockRestore();
    watchSpy.mockRestore();
  });

  it('does not auto-select if disabled', async () => {
    const devices = [
      { kind: 'audioinput', deviceId: 'device-1', label: 'Microphone 1' },
      { kind: 'audioinput', deviceId: 'device-2', label: 'Microphone 2' },
    ] as MediaDeviceInfo[];

    const listSpy = vi.spyOn(runtime, 'listAudioInputs').mockResolvedValue({
      devices,
      permission: 'granted',
    });
    const watchSpy = vi.spyOn(runtime, 'watchAudioDeviceChanges').mockReturnValue(vi.fn());

    const { result } = renderHook(() => useAudioInputs({ autoSelectFirst: false }));

    await waitFor(() => expect(result.current.enumerating).toBe(false));
    expect(result.current.selectedDeviceId).toBe('');

    listSpy.mockRestore();
    watchSpy.mockRestore();
  });

  it('refreshes device list', async () => {
    const devices = [
      { kind: 'audioinput', deviceId: 'device-1', label: 'Microphone 1' },
      { kind: 'audioinput', deviceId: 'device-2', label: 'Microphone 2' },
    ] as MediaDeviceInfo[];

    const listSpy = vi.spyOn(runtime, 'listAudioInputs').mockResolvedValue({
      devices,
      permission: 'granted',
    });
    const watchSpy = vi.spyOn(runtime, 'watchAudioDeviceChanges').mockReturnValue(vi.fn());

    const { result } = renderHook(() => useAudioInputs());

    await waitFor(() => expect(result.current.enumerating).toBe(false));

    await result.current.refresh();

    expect(result.current.devices).toHaveLength(2);

    listSpy.mockRestore();
    watchSpy.mockRestore();
  });

  it('handles errors during enumeration', async () => {
    const listSpy = vi.spyOn(runtime, 'listAudioInputs').mockRejectedValue(new Error('Permission denied'));
    const watchSpy = vi.spyOn(runtime, 'watchAudioDeviceChanges').mockReturnValue(vi.fn());

    const { result } = renderHook(() => useAudioInputs());

    await waitFor(() => expect(result.current.enumerating).toBe(false));
    expect(result.current.error).toBe('Permission denied');
    expect(result.current.devices).toEqual([]);
    expect(result.current.selectedDeviceId).toBe('');

    listSpy.mockRestore();
    watchSpy.mockRestore();
  });
});
