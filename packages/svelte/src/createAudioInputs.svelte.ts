import type { ListAudioInputsOptions } from '@saraudio/runtime-browser';
import { listAudioInputs, watchAudioDeviceChanges } from '@saraudio/runtime-browser';

export interface CreateAudioInputsOptions {
  promptOnMount?: boolean;
  autoSelectFirst?: boolean;
  rememberLast?: boolean;
  storageKey?: string;
  listOptions?: Omit<ListAudioInputsOptions, 'requestPermission'>;
}

export interface AudioInputsResult {
  readonly devices: ReadonlyArray<MediaDeviceInfo>;
  readonly selectedDeviceId: string;
  readonly enumerating: boolean;
  readonly error: string | null;
  setSelectedDeviceId: (id: string) => void;
  refresh: () => Promise<void>;
}

const DEFAULT_STORAGE_KEY = 'saraudio:selectedDeviceId';

export function createAudioInputs(options: CreateAudioInputsOptions = {}): AudioInputsResult {
  const { promptOnMount = false, autoSelectFirst = true, rememberLast = true, storageKey, listOptions } = options;
  const effectiveKey = storageKey ?? DEFAULT_STORAGE_KEY;
  const refreshMode = promptOnMount ? 'prompt' : 'auto';

  let devices = $state<MediaDeviceInfo[]>([]);
  let selectedDeviceId = $state<string>('');
  let enumerating = $state(false);
  let error = $state<string | null>(null);
  let mounted = true;

  // Load saved device on mount
  if (rememberLast && typeof window !== 'undefined') {
    try {
      const saved = window.localStorage.getItem(effectiveKey);
      if (saved) selectedDeviceId = saved;
    } catch {}
  }

  const refresh = async () => {
    enumerating = true;
    error = null;
    try {
      const res = await listAudioInputs({ ...(listOptions ?? {}), requestPermission: refreshMode });
      if (!mounted) return;
      devices = res.devices;
      if (autoSelectFirst && !selectedDeviceId) {
        selectedDeviceId = res.devices[0]?.deviceId || '';
      }
    } catch (e) {
      if (!mounted) return;
      devices = [];
      selectedDeviceId = '';
      error = e instanceof Error ? e.message : 'Failed to enumerate audio devices.';
    } finally {
      if (mounted) enumerating = false;
    }
  };

  $effect(() => {
    mounted = true;
    void refresh();
    const sub = watchAudioDeviceChanges(() => void refresh());
    return () => {
      mounted = false;
      sub();
    };
  });

  return {
    get devices() {
      return devices;
    },
    get selectedDeviceId() {
      return selectedDeviceId;
    },
    get enumerating() {
      return enumerating;
    },
    get error() {
      return error;
    },
    setSelectedDeviceId: (id: string) => {
      selectedDeviceId = id;
      if (rememberLast && typeof window !== 'undefined') {
        try {
          window.localStorage.setItem(effectiveKey, id);
        } catch {}
      }
    },
    refresh,
  };
}
