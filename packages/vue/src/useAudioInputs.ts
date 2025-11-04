import type { ListAudioInputsOptions } from '@saraudio/runtime-browser';
import { listAudioInputs, watchAudioDeviceChanges } from '@saraudio/runtime-browser';
import type { Ref } from 'vue';
import { onMounted, onUnmounted, ref, watch } from 'vue';

export interface UseAudioInputsOptions {
  promptOnMount?: boolean;
  autoSelectFirst?: boolean;
  rememberLast?: boolean;
  storageKey?: string;
  listOptions?: Omit<ListAudioInputsOptions, 'requestPermission'>;
}

export interface UseAudioInputsResult {
  devices: Ref<ReadonlyArray<MediaDeviceInfo>>;
  selectedDeviceId: Ref<string>;
  enumerating: Ref<boolean>;
  error: Ref<string | null>;
  refresh: () => Promise<void>;
}

const DEFAULT_STORAGE_KEY = 'saraudio:selectedDeviceId';

export function useAudioInputs(options: UseAudioInputsOptions = {}): UseAudioInputsResult {
  const { promptOnMount = false, autoSelectFirst = true, rememberLast = true, storageKey, listOptions } = options;
  const effectiveKey = storageKey ?? DEFAULT_STORAGE_KEY;
  const refreshMode = promptOnMount ? 'prompt' : 'auto';

  const devices = ref<MediaDeviceInfo[]>([]);
  const selectedDeviceId = ref<string>('');
  const enumerating = ref(false);
  const error = ref<string | null>(null);
  let mounted = false;

  // Load saved device on mount
  if (rememberLast && typeof window !== 'undefined') {
    try {
      const saved = window.localStorage.getItem(effectiveKey);
      if (saved) selectedDeviceId.value = saved;
    } catch {}
  }

  // Save to localStorage when selection changes
  watch(selectedDeviceId, (newId) => {
    if (rememberLast && typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(effectiveKey, newId);
      } catch {}
    }
  });

  const refresh = async () => {
    enumerating.value = true;
    error.value = null;
    try {
      const res = await listAudioInputs({ ...(listOptions ?? {}), requestPermission: refreshMode });
      if (!mounted) return;
      devices.value = res.devices;
      if (autoSelectFirst && !selectedDeviceId.value) {
        selectedDeviceId.value = res.devices[0]?.deviceId || '';
      }
    } catch (e) {
      if (!mounted) return;
      devices.value = [];
      selectedDeviceId.value = '';
      error.value = e instanceof Error ? e.message : 'Failed to enumerate audio devices.';
    } finally {
      if (mounted) enumerating.value = false;
    }
  };

  onMounted(() => {
    mounted = true;
    void refresh();
    const sub = watchAudioDeviceChanges(() => void refresh());
    onUnmounted(() => {
      mounted = false;
      sub();
    });
  });

  return {
    devices,
    selectedDeviceId,
    enumerating,
    error,
    refresh,
  };
}
