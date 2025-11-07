import type { BaseProviderOptions, TranscriptionProvider } from '@saraudio/core';

export interface SonioxOptions extends BaseProviderOptions {
  /** Realtime model id, e.g. 'stt-rt-v3' or 'stt-rt-preview'. */
  model: string;
  /** Preferred sample rate; sent when using raw PCM. Default 16000. */
  sampleRate?: number;
  /** Channel count (1|2). Default 1. */
  channels?: 1 | 2;
  /** audio_format for initial config. Default 'pcm_s16le'. Use 'auto' to let server detect. */
  audioFormat?: 'pcm_s16le' | 'auto' | string;
  /** Optional language hints (e.g., ['en','es']). */
  languageHints?: ReadonlyArray<string>;
  /** Drop‑queue budget in ms of audio. Default 200ms, clamped [100..500]. */
  queueBudgetMs?: number;
}

export type SonioxProvider = TranscriptionProvider<SonioxOptions>;
