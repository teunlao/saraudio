import type { TranscriptionProvider } from '@saraudio/core';
import type { Logger } from '@saraudio/utils';

export interface SonioxOptions {
  /** API key or temporary token. One of apiKey|token|tokenProvider is required. */
  apiKey?: string;
  token?: string;
  tokenProvider?: () => Promise<string>;
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
  /** Provider logger. */
  logger?: Logger;
  /** WebSocket endpoint override. Default wss://stt-rt.soniox.com/transcribe-websocket */
  wsUrl?: string;
  /** REST API base URL override. Default https://api.soniox.com/v1 */
  httpBaseUrl?: string;
  /** Drop‑queue budget in ms of audio. Default 200ms, clamped [100..500]. */
  queueBudgetMs?: number;
}

export type SonioxProvider = TranscriptionProvider<SonioxOptions>;
