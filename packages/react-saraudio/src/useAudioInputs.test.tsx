import * as runtime from '@saraudio/runtime-browser';
import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useAudioInputs } from './useAudioInputs';

describe('useAudioInputs', () => {
  it('lists devices on mount and autoselects first', async () => {
    const devices = [
      { kind: 'audioinput', deviceId: 'a1', label: 'Mic 1' },
      { kind: 'audioinput', deviceId: 'a2', label: 'Mic 2' },
    ] as MediaDeviceInfo[];

    const listSpy = vi.spyOn(runtime, 'listAudioInputs').mockResolvedValue({
      devices,
      permission: 'granted',
    });
    const watchSpy = vi.spyOn(runtime, 'watchAudioDeviceChanges').mockReturnValue({ unsubscribe: vi.fn() });

    const { result } = renderHook(() => useAudioInputs({ promptOnMount: true, autoSelectFirst: true }));

    await waitFor(() => expect(result.current.enumerating).toBe(false));
    expect(result.current.devices.length).toBe(2);
    expect(result.current.selectedDeviceId).toBe('a1');

    expect(listSpy).toHaveBeenCalled();
    expect(watchSpy).toHaveBeenCalled();

    listSpy.mockRestore();
    watchSpy.mockRestore();
  });
});
