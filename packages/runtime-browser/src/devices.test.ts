import { describe, expect, it, vi } from 'vitest';
import { buildAudioConstraints, listAudioInputs, watchAudioDeviceChanges } from './devices';

describe('devices helpers', () => {
  it('buildAudioConstraints builds only provided fields', () => {
    expect(buildAudioConstraints({ deviceId: 'abc', sampleRate: 16000, channelCount: 1 })).toEqual({
      deviceId: { exact: 'abc' },
      sampleRate: 16000,
      channelCount: 1,
    });
    expect(buildAudioConstraints({})).toEqual({});
  });

  it('listAudioInputs returns granted after successful prompt and filters audioinput', async () => {
    const enumerateDevices = vi.fn().mockResolvedValue([
      { kind: 'videoinput', deviceId: 'v1' },
      { kind: 'audioinput', deviceId: 'a1' },
      { kind: 'audioinput', deviceId: 'a2' },
    ] as MediaDeviceInfo[]);
    const fakeStream = { getTracks: () => [{ stop: vi.fn() }] } as unknown as MediaStream;
    const getUserMedia = vi.fn().mockResolvedValue(fakeStream);
    (globalThis as unknown as { navigator: Navigator }).navigator = {
      mediaDevices: { enumerateDevices, getUserMedia } as unknown as MediaDevices,
    } as unknown as Navigator;

    const res = await listAudioInputs({ requestPermission: 'prompt' });
    expect(getUserMedia).toHaveBeenCalled();
    expect(res.permission).toBe('granted');
    expect(res.devices.map((d) => d.deviceId)).toEqual(['a1', 'a2']);
  });

  it('watchAudioDeviceChanges subscribes and unsubscribes', () => {
    const addEventListener = vi.fn();
    const removeEventListener = vi.fn();
    (globalThis as unknown as { navigator: Navigator }).navigator = {
      mediaDevices: { addEventListener, removeEventListener } as unknown as MediaDevices,
    } as unknown as Navigator;

    const h = vi.fn();
    const sub = watchAudioDeviceChanges(h);
    expect(addEventListener).toHaveBeenCalledWith('devicechange', expect.any(Function));
    sub.unsubscribe();
    expect(removeEventListener).toHaveBeenCalledWith('devicechange', expect.any(Function));
  });
});
