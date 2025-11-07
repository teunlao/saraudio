import type { RuntimeMode } from '@saraudio/runtime-browser';
import type { Ref } from 'vue';
import { watch } from 'vue';

const MODE_KEY = 'saraudio:demo:transcription:mode';
const THRESHOLD_KEY = 'saraudio:demo:transcription:threshold';
const SMOOTH_KEY = 'saraudio:demo:transcription:smooth';
const FALLBACK_KEY = 'saraudio:demo:transcription:fallback';
const TRANSPORT_KEY = 'saraudio:demo:transcription:transport';

interface Settings {
  mode: Ref<RuntimeMode>;
  thresholdDb: Ref<number>;
  smoothMs: Ref<number>;
  allowFallback: Ref<boolean>;
  transportMode: Ref<'websocket' | 'http'>;
}

export function useLocalStorageSettings(settings: Settings) {
  const keys = {
    mode: MODE_KEY,
    threshold: THRESHOLD_KEY,
    smooth: SMOOTH_KEY,
    fallback: FALLBACK_KEY,
    transport: TRANSPORT_KEY,
  };
  // Load from localStorage on mount
  if (typeof window !== 'undefined') {
    try {
      const savedMode = window.localStorage.getItem(keys.mode);
      if (savedMode === 'auto' || savedMode === 'worklet' || savedMode === 'audio-context') {
        settings.mode.value = savedMode;
      }
      const savedThreshold = window.localStorage.getItem(keys.threshold);
      if (savedThreshold) settings.thresholdDb.value = Number(savedThreshold);
      const savedSmooth = window.localStorage.getItem(keys.smooth);
      if (savedSmooth) settings.smoothMs.value = Number(savedSmooth);
      const savedFallback = window.localStorage.getItem(keys.fallback);
      if (savedFallback) settings.allowFallback.value = savedFallback !== '0';
      const savedTransport = window.localStorage.getItem(keys.transport);
      if (savedTransport === 'websocket' || savedTransport === 'http') {
        settings.transportMode.value = savedTransport;
      }
    } catch {}
  }

  // Watch and save changes
  watch(settings.mode, (value) => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(keys.mode, value);
    } catch {}
  });

  watch(settings.thresholdDb, (value) => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(keys.threshold, String(value));
    } catch {}
  });

  watch(settings.smoothMs, (value) => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(keys.smooth, String(value));
    } catch {}
  });

  watch(settings.allowFallback, (value) => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(keys.fallback, value ? '1' : '0');
    } catch {}
  });

  watch(settings.transportMode, (value) => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(keys.transport, value);
    } catch {}
  });
}
