import type { TranscriptToken, TranscriptUpdate } from '@saraudio/core';
import type { DeepgramResultsMessage, DeepgramUtteranceEndMessage } from './DeepgramWsModels';
import type { DeepgramErrorMessage } from './errors';

export type DeepgramRawMessage = DeepgramResultsMessage | DeepgramUtteranceEndMessage | DeepgramErrorMessage;

export type DeepgramTokenMetadata = {
  rawWord?: string;
  punctuatedWord?: string;
};

export type DeepgramUpdateMetadata = {
  type?: string;
  isFinal?: boolean;
  speechFinal?: boolean;
  channelIndex?: ReadonlyArray<number>;
  requestId?: string;
  channel?: ReadonlyArray<number>;
  lastWordEndMs?: number;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const isDeepgramUpdate = (
  update: TranscriptUpdate,
): update is TranscriptUpdate & {
  providerId: 'deepgram';
  metadata?: DeepgramUpdateMetadata;
  raw?: DeepgramRawMessage;
} => update.providerId === 'deepgram';

export const asDeepgramTokenMetadata = (token: TranscriptToken): DeepgramTokenMetadata | null => {
  if (!isRecord(token.metadata)) return null;
  const rawWord = typeof token.metadata.rawWord === 'string' ? token.metadata.rawWord : undefined;
  const punctuatedWord = typeof token.metadata.punctuatedWord === 'string' ? token.metadata.punctuatedWord : undefined;
  if (!rawWord && !punctuatedWord) return null;
  return { rawWord, punctuatedWord };
};

export const asDeepgramUpdateMetadata = (update: TranscriptUpdate): DeepgramUpdateMetadata | null => {
  if (!isRecord(update.metadata)) return null;

  const type = typeof update.metadata.type === 'string' ? update.metadata.type : undefined;
  const isFinal = typeof update.metadata.isFinal === 'boolean' ? update.metadata.isFinal : undefined;
  const speechFinal = typeof update.metadata.speechFinal === 'boolean' ? update.metadata.speechFinal : undefined;
  const channelIndex = Array.isArray(update.metadata.channelIndex) ? update.metadata.channelIndex : undefined;
  const requestId = typeof update.metadata.requestId === 'string' ? update.metadata.requestId : undefined;

  const channel = Array.isArray(update.metadata.channel) ? update.metadata.channel : undefined;
  const lastWordEndMs = typeof update.metadata.lastWordEndMs === 'number' ? update.metadata.lastWordEndMs : undefined;

  if (
    type === undefined &&
    isFinal === undefined &&
    speechFinal === undefined &&
    channelIndex === undefined &&
    requestId === undefined &&
    channel === undefined &&
    lastWordEndMs === undefined
  ) {
    return null;
  }
  return { type, isFinal, speechFinal, channelIndex, requestId, channel, lastWordEndMs };
};
