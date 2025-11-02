export type DevicePermission = 'granted' | 'denied' | 'prompt';

export interface ListAudioInputsOptions {
  requestPermission?: 'auto' | 'prompt' | 'never';
}

export interface ListAudioInputsResult {
  devices: MediaDeviceInfo[];
  permission: DevicePermission;
  error?: string;
}

const hasNavigator = (): boolean => typeof navigator !== 'undefined';

export async function listAudioInputs(options: ListAudioInputsOptions = {}): Promise<ListAudioInputsResult> {
  if (!hasNavigator() || !navigator.mediaDevices?.enumerateDevices) {
    return {
      devices: [],
      permission: 'prompt',
      error: 'Device enumeration is not supported in this environment',
    };
  }

  const mode = options.requestPermission ?? 'auto';
  let permission: DevicePermission = 'prompt';

  if (mode === 'prompt' && navigator.mediaDevices.getUserMedia) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream?.getTracks?.().forEach((t) => t.stop());
      permission = 'granted';
    } catch (error) {
      // Map common DOMException names to denied; otherwise keep as prompt
      const name = (error as { name?: string } | undefined)?.name;
      permission = name === 'NotAllowedError' ? 'denied' : 'prompt';
    }
  }

  const all = await navigator.mediaDevices.enumerateDevices();
  const audioInputs = all.filter((d) => d.kind === 'audioinput');

  return { devices: audioInputs, permission };
}

export function watchAudioDeviceChanges(handler: () => void): { unsubscribe(): void } {
  if (!hasNavigator() || !navigator.mediaDevices) {
    return { unsubscribe: () => void 0 };
  }
  const md = navigator.mediaDevices as unknown as MediaDevices & {
    addEventListener?: (type: string, cb: () => void) => void;
    removeEventListener?: (type: string, cb: () => void) => void;
    ondevicechange?: (() => void) | null;
  };

  const cb = () => handler();
  if (typeof md.addEventListener === 'function' && typeof md.removeEventListener === 'function') {
    md.addEventListener('devicechange', cb);
    return { unsubscribe: () => md.removeEventListener?.('devicechange', cb) };
  }
  const prev = md.ondevicechange ?? null;
  md.ondevicechange = cb;
  return { unsubscribe: () => { md.ondevicechange = prev; } };
}

export function buildAudioConstraints(input: {
  deviceId?: string | null;
  sampleRate?: number;
  channelCount?: number;
}): MediaTrackConstraints {
  const c: MediaTrackConstraints = {};
  if (input.deviceId) c.deviceId = { exact: input.deviceId };
  if (typeof input.sampleRate === 'number') c.sampleRate = input.sampleRate;
  if (typeof input.channelCount === 'number') c.channelCount = input.channelCount;
  return c;
}

