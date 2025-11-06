import type {
  AudioSource,
  BatchOptions,
  ProviderCapabilities,
  RecorderFormatOptions,
  StreamOptions,
  TranscriptionStream,
  TranscriptResult,
} from '@saraudio/core';

import type { DeepgramModelId } from './models';
import type { DeepgramOptions } from './types';

export interface BaseTransportStrategy {
  readonly kind: 'websocket' | 'http';
  readonly capabilities: ProviderCapabilities;
  getPreferredFormat(): RecorderFormatOptions;
  getSupportedFormats(): ReadonlyArray<RecorderFormatOptions>;
  negotiateFormat(candidate: RecorderFormatOptions): RecorderFormatOptions;
  update(options: DeepgramOptions<DeepgramModelId>): void;
  rawOptions(): DeepgramOptions<DeepgramModelId>;
  tokenProvider(): (() => Promise<string>) | undefined;
}

export interface WebSocketTransportStrategy extends BaseTransportStrategy {
  readonly kind: 'websocket';
  stream(options?: StreamOptions): TranscriptionStream;
}

export interface HttpTransportStrategy extends BaseTransportStrategy {
  readonly kind: 'http';
  transcribe(audio: AudioSource, options: BatchOptions | undefined, signal?: AbortSignal): Promise<TranscriptResult>;
}

export type TransportStrategy = WebSocketTransportStrategy | HttpTransportStrategy;
