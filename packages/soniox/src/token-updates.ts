import type { TranscriptToken, TranscriptUpdate } from '@saraudio/core';
import type { SonioxWsErrorResponse, SonioxWsFinishedResponse, SonioxWsStreamResponse } from './SonioxWsRealtimeModel';

export type SonioxRawMessage = SonioxWsStreamResponse | SonioxWsFinishedResponse | SonioxWsErrorResponse;

export type SonioxTokenMetadata = {
  language?: string;
  sourceLanguage?: string;
  translationStatus?: string;
};

export type SonioxUpdateMetadata = {
  finalAudioProcMs?: number;
  totalAudioProcMs?: number;
  finished?: boolean;
  speakerLabels?: Record<string, string>;
};

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

export const isSonioxUpdate = (
  update: TranscriptUpdate,
): update is TranscriptUpdate & { providerId: 'soniox'; metadata?: SonioxUpdateMetadata; raw?: SonioxRawMessage } =>
  update.providerId === 'soniox';

export const asSonioxTokenMetadata = (token: TranscriptToken): SonioxTokenMetadata | null => {
  if (!isRecord(token.metadata)) return null;
  const language = typeof token.metadata.language === 'string' ? token.metadata.language : undefined;
  const sourceLanguage = typeof token.metadata.sourceLanguage === 'string' ? token.metadata.sourceLanguage : undefined;
  const translationStatus =
    typeof token.metadata.translationStatus === 'string' ? token.metadata.translationStatus : undefined;

  if (!language && !sourceLanguage && !translationStatus) return null;
  return { language, sourceLanguage, translationStatus };
};

export const asSonioxUpdateMetadata = (update: TranscriptUpdate): SonioxUpdateMetadata | null => {
  if (!isRecord(update.metadata)) return null;
  const finalAudioProcMs =
    typeof update.metadata.finalAudioProcMs === 'number' ? update.metadata.finalAudioProcMs : undefined;
  const totalAudioProcMs =
    typeof update.metadata.totalAudioProcMs === 'number' ? update.metadata.totalAudioProcMs : undefined;
  const finished = update.metadata.finished === true ? true : undefined;

  let speakerLabels: Record<string, string> | undefined;
  if (isRecord(update.metadata.speakerLabels)) {
    const mapped: Record<string, string> = {};
    for (const [k, v] of Object.entries(update.metadata.speakerLabels)) {
      if (typeof v === 'string') mapped[k] = v;
    }
    if (Object.keys(mapped).length > 0) speakerLabels = mapped;
  }

  if (
    finalAudioProcMs === undefined &&
    totalAudioProcMs === undefined &&
    finished === undefined &&
    speakerLabels === undefined
  )
    return null;
  return { finalAudioProcMs, totalAudioProcMs, finished, speakerLabels };
};
