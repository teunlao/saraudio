import { DEEPGRAM_MODEL_DEFINITIONS, type DeepgramModelId, isLanguageSupported } from './models';
import type { DeepgramOptions } from './types';

/** Default Deepgram realtime endpoint (listen v1). */
export const DEFAULT_BASE_URL = 'wss://api.deepgram.com/v1/listen';
/** Safe default sample rate (Hz) when user has not negotiated format yet. */
export const DEFAULT_SAMPLE_RATE = 16_000;
/** Default mono channel count; normalized to 1|2 later. */
export const DEFAULT_CHANNELS: 1 | 2 = 1;
/**
 * WebSocket keepalive interval in milliseconds.
 * Defaults to 8000ms; clamped by KEEPALIVE_MIN_MS..KEEPALIVE_MAX_MS.
 */
export const DEFAULT_KEEPALIVE_MS = 8_000;
/** Minimal allowed keepalive interval (1s) to avoid busy loops. */
export const KEEPALIVE_MIN_MS = 1_000;
/** Maximal allowed keepalive interval (30s) to prevent idle disconnects. */
export const KEEPALIVE_MAX_MS = 30_000;
/**
 * Backpressure budget in milliseconds of audio buffered client‑side before dropping oldest frames.
 * Defaults to 200ms; clamped by QUEUE_MIN_MS..QUEUE_MAX_MS.
 */
export const DEFAULT_QUEUE_BUDGET_MS = 200;
/** Minimal queue budget (100ms) to keep latency low under pressure. */
export const QUEUE_MIN_MS = 100;
/** Maximal queue budget (500ms) to bound memory/latency growth. */
export const QUEUE_MAX_MS = 500;

export interface DeepgramResolvedConfig {
  raw: DeepgramOptions<DeepgramModelId>;
  queueBudgetMs: number;
  keepaliveMs: number;
  sampleRate: number;
  channels: 1 | 2;
  baseParams: URLSearchParams;
}

/** Clamp numeric value to the inclusive [min, max] range; returns min for NaN/Infinity. */
export function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value) || !Number.isFinite(value)) return min;
  return Math.min(Math.max(value, min), max);
}

/** Normalize requested channel count to deegram‑supported 1 or 2. */
export function normalizeChannels(channels: number): 1 | 2 {
  return channels >= 2 ? 2 : 1;
}

/**
 * Validate options, apply defaults and clamps, and prebuild base URLSearchParams.
 * Throws on unsupported model or invalid language for model.
 */
export function resolveConfig<T extends DeepgramModelId>(options: DeepgramOptions<T>): DeepgramResolvedConfig {
  if (!DEEPGRAM_MODEL_DEFINITIONS[options.model]) {
    throw new Error(`Unsupported Deepgram model: ${options.model}`);
  }
  if (options.language && !isLanguageSupported(options.model, options.language)) {
    throw new Error(`Language ${options.language} is not supported by model ${options.model}`);
  }
  const queueBudgetMs = clamp(options.queueBudgetMs ?? DEFAULT_QUEUE_BUDGET_MS, QUEUE_MIN_MS, QUEUE_MAX_MS);
  const keepaliveMs = clamp(options.keepaliveMs ?? DEFAULT_KEEPALIVE_MS, KEEPALIVE_MIN_MS, KEEPALIVE_MAX_MS);
  const sampleRate = options.sampleRate ?? DEFAULT_SAMPLE_RATE;
  const channels: 1 | 2 = options.channels ?? (options.multichannel ? 2 : DEFAULT_CHANNELS);
  const baseParams = buildBaseParams({ ...options, sampleRate, channels });
  return {
    raw: options,
    queueBudgetMs,
    keepaliveMs,
    sampleRate,
    channels,
    baseParams,
  } satisfies DeepgramResolvedConfig;
}

/** Build minimal required query params common for all sessions. */
export function buildBaseParams<M extends DeepgramModelId>(
  options: DeepgramOptions<M> & { sampleRate: number; channels: 1 | 2 },
): URLSearchParams {
  const params = new URLSearchParams();
  params.set('model', options.model);
  params.set('encoding', options.encoding ?? 'linear16');
  params.set('sample_rate', String(options.sampleRate));
  params.set('channels', String(options.channels));
  const multichannel = options.multichannel ?? options.channels > 1;
  if (multichannel) params.set('multichannel', 'true');
  if (options.language) params.set('language', options.language);
  if (options.version) params.set('version', options.version);
  params.set('interim_results', (options.interimResults ?? true) ? 'true' : 'false');
  return params;
}
