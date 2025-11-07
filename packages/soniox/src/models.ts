/** Soniox официальные модели (полные имена для API). */
export const SONIOX_REALTIME_MODELS = ['stt-rt-v3'] as const;
export const SONIOX_ASYNC_MODELS = ['stt-async-v3'] as const;

export type SonioxRealtimeModelId = (typeof SONIOX_REALTIME_MODELS)[number];
export type SonioxAsyncModelId = (typeof SONIOX_ASYNC_MODELS)[number];
export type SonioxModelId = SonioxRealtimeModelId | SonioxAsyncModelId;

export const SONIOX_MODEL_DEFINITIONS: Record<SonioxModelId, { type: 'realtime' | 'async'; label: string }>
  = {
    'stt-rt-v3': { type: 'realtime', label: 'Speech-to-Text Real-time v3' },
    'stt-async-v3': { type: 'async', label: 'Speech-to-Text Async v3' },
  } as const;
