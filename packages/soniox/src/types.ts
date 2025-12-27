import type { BaseProviderOptions, TranscriptionProvider } from '@saraudio/core';
import type { SonioxModelId } from './models';

export interface SonioxOptions extends BaseProviderOptions {
  /** Model id. Realtime: 'stt-rt-v3'. Async (batch REST): 'stt-async-v3'. Aliases supported. */
  model: SonioxModelId;
  /** Preferred sample rate; sent when using raw PCM. Default 16000. */
  sampleRate?: number;
  /** Channel count (1|2). Default 1. */
  channels?: 1 | 2;
  /** audio_format for initial config. Default 'pcm_s16le'. Use 'auto' to let server detect. */
  audioFormat?: 'pcm_s16le' | 'auto' | string;
  /** Optional language hints (e.g., ['en','es']). */
  languageHints?: ReadonlyArray<string>;
  /** Enable speaker diarization (speaker labels in word timestamps). */
  diarization?: boolean;
  /** Enable server-side endpoint detection (utterance segmentation via '<end>' marker). */
  endpointDetection?: boolean;
  /** Enable language identification (token language fields when available). */
  languageIdentification?: boolean;
  /** Drop‑queue budget in ms of audio. Default 200ms, clamped [100..500]. */
  queueBudgetMs?: number;
}

export type SonioxProvider = TranscriptionProvider<SonioxOptions>;
