import type { SonioxOptions } from './types';

export const DEFAULT_WS_URL = 'wss://stt-rt.soniox.com/transcribe-websocket';
export const DEFAULT_HTTP_BASE = 'https://api.soniox.com/v1';
export const DEFAULT_SAMPLE_RATE = 16_000;
export const DEFAULT_CHANNELS: 1 | 2 = 1;
export const DEFAULT_QUEUE_BUDGET_MS = 200;
export const QUEUE_MIN_MS = 100;
export const QUEUE_MAX_MS = 500;

export interface SonioxResolvedConfig {
  raw: SonioxOptions;
  wsUrl: string;
  httpBase: string;
  sampleRate: number;
  channels: 1 | 2;
  audioFormat: string;
  queueBudgetMs: number;
}

export function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

export function normalizeChannels(ch: number | undefined): 1 | 2 {
  return ch && ch >= 2 ? 2 : 1;
}

export function resolveConfig(options: SonioxOptions): SonioxResolvedConfig {
  const sampleRate = options.sampleRate ?? DEFAULT_SAMPLE_RATE;
  const channels = normalizeChannels(options.channels ?? DEFAULT_CHANNELS);
  const audioFormat = options.audioFormat ?? 'pcm_s16le';
  const queueBudgetMs = clamp(options.queueBudgetMs ?? DEFAULT_QUEUE_BUDGET_MS, QUEUE_MIN_MS, QUEUE_MAX_MS);
  return {
    raw: options,
    wsUrl: options.wsUrl ?? DEFAULT_WS_URL,
    httpBase: options.httpBaseUrl ?? DEFAULT_HTTP_BASE,
    sampleRate,
    channels,
    audioFormat,
    queueBudgetMs,
  } satisfies SonioxResolvedConfig;
}
