import type { ListAudioInputsOptions } from '@saraudio/runtime-browser';
import { listAudioInputs, watchAudioDeviceChanges } from '@saraudio/runtime-browser';
import { type Accessor, createEffect, createSignal, onCleanup, onMount } from 'solid-js';

export interface CreateAudioInputsOptions {
  promptOnMount?: boolean;
  autoSelectFirst?: boolean;
  rememberLast?: boolean;
  storageKey?: string;
  listOptions?: Omit<ListAudioInputsOptions, 'requestPermission'>;
}

export interface AudioInputsResult {
  readonly devices: Accessor<ReadonlyArray<MediaDeviceInfo>>;
  readonly selectedDeviceId: Accessor<string>;
  setSelectedDeviceId: (id: string) => void;
  readonly enumerating: Accessor<boolean>;
  readonly error: Accessor<string | null>;
  refresh: () => Promise<void>;
}

const DEFAULT_STORAGE_KEY = 'saraudio:selectedDeviceId';

export function createAudioInputs(options: CreateAudioInputsOptions = {}): AudioInputsResult {
  const { promptOnMount = false, autoSelectFirst = true, rememberLast = true, storageKey, listOptions } = options;
  const effectiveKey = storageKey ?? DEFAULT_STORAGE_KEY;
  const refreshMode = promptOnMount ? 'prompt' : 'auto';

  const [devices, setDevices] = createSignal<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceIdInternal] = createSignal<string>('');
  const [enumerating, setEnumerating] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  let mounted = false;

  // Load saved device on mount
  if (rememberLast && typeof window !== 'undefined') {
    try {
      const saved = window.localStorage.getItem(effectiveKey);
      if (saved) setSelectedDeviceIdInternal(saved);
    } catch {}
  }

  // Save to localStorage when selection changes
  createEffect(() => {
    const id = selectedDeviceId();
    if (rememberLast && typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(effectiveKey, id);
      } catch {}
    }
  });

  const setSelectedDeviceId = (id: string) => {
    setSelectedDeviceIdInternal(id);
  };

  const refresh = async () => {
    setEnumerating(true);
    setError(null);
    try {
      const res = await listAudioInputs({ ...(listOptions ?? {}), requestPermission: refreshMode });
      if (!mounted) return;
      setDevices(res.devices);
      if (autoSelectFirst && !selectedDeviceId()) {
        setSelectedDeviceIdInternal(res.devices[0]?.deviceId || '');
      }
    } catch (e) {
      if (!mounted) return;
      setDevices([]);
      setSelectedDeviceIdInternal('');
      setError(e instanceof Error ? e.message : 'Failed to enumerate audio devices.');
    } finally {
      if (mounted) setEnumerating(false);
    }
  };

  onMount(() => {
    mounted = true;
    void refresh();
    const unsub = watchAudioDeviceChanges(() => void refresh());
    onCleanup(() => {
      mounted = false;
      unsub();
    });
  });

  return {
    devices,
    selectedDeviceId,
    setSelectedDeviceId,
    enumerating,
    error,
    refresh,
  };
}
