import type { ListAudioInputsOptions } from '@saraudio/runtime-browser';
import { listAudioInputs, watchAudioDeviceChanges } from '@saraudio/runtime-browser';
import { useCallback, useEffect, useRef, useState } from 'react';

export interface UseAudioInputsOptions {
  promptOnMount?: boolean;
  autoSelectFirst?: boolean;
  rememberLast?: boolean;
  storageKey?: string; // used when rememberLast=true
  listOptions?: Omit<ListAudioInputsOptions, 'requestPermission'>;
}

export interface UseAudioInputsResult {
  devices: ReadonlyArray<MediaDeviceInfo>;
  selectedDeviceId: string;
  setSelectedDeviceId: (id: string) => void;
  enumerating: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

const DEFAULT_STORAGE_KEY = 'saraudio:selectedDeviceId';

export function useAudioInputs(options: UseAudioInputsOptions = {}): UseAudioInputsResult {
  const { promptOnMount = false, autoSelectFirst = true, rememberLast = true, storageKey, listOptions } = options;
  const effectiveKey = storageKey ?? DEFAULT_STORAGE_KEY;

  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceIdState] = useState<string>(() => {
    if (rememberLast && typeof window !== 'undefined') {
      try {
        return window.localStorage.getItem(effectiveKey) ?? '';
      } catch {}
    }
    return '';
  });
  const [enumerating, setEnumerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);
  const refreshMode = promptOnMount ? 'prompt' : 'auto';

  const setSelectedDeviceId = useCallback(
    (id: string) => {
      setSelectedDeviceIdState(id);
      if (rememberLast && typeof window !== 'undefined') {
        try {
          window.localStorage.setItem(effectiveKey, id);
        } catch {}
      }
    },
    [rememberLast, effectiveKey],
  );

  const refresh = useCallback(async () => {
    setEnumerating(true);
    setError(null);
    try {
      const res = await listAudioInputs({ ...(listOptions ?? {}), requestPermission: refreshMode });
      if (!mountedRef.current) return;
      setDevices(res.devices);
      if (autoSelectFirst) {
        setSelectedDeviceIdState((current) => current || res.devices[0]?.deviceId || '');
      }
    } catch (e) {
      if (!mountedRef.current) return;
      setDevices([]);
      setSelectedDeviceIdState('');
      setError(e instanceof Error ? e.message : 'Failed to enumerate audio devices.');
    } finally {
      if (mountedRef.current) setEnumerating(false);
    }
  }, [autoSelectFirst, listOptions, refreshMode]);

  useEffect(() => {
    mountedRef.current = true;
    void refresh();
    const sub = watchAudioDeviceChanges(() => void refresh());
    return () => {
      mountedRef.current = false;
      sub();
    };
  }, [refresh]);

  return {
    devices,
    selectedDeviceId,
    setSelectedDeviceId,
    enumerating,
    error,
    refresh,
  };
}
