import type { TranscriptResult } from '@saraudio/core';
import type { Logger } from '@saraudio/utils';
import { mergeHeaders, normalizeHeaders } from '@saraudio/utils';
import type { SonioxResolvedConfig } from './config';
import { sonioxTranscribeFile } from './files';

// Minimal batch transcription via Soniox REST API.
// Strategy: upload chunk → create job → poll → fetch transcript (batch flow).

export async function transcribeHTTP(
  resolved: SonioxResolvedConfig,
  audio: Blob | ArrayBuffer | Uint8Array,
  _options?: { language?: string; diarization?: boolean },
  _signal?: AbortSignal,
  logger?: Logger,
): Promise<TranscriptResult> {
  const provided = typeof resolved.raw.headers === 'function' ? await resolved.raw.headers({ transport: 'http' }) : resolved.raw.headers;
  const _headers = provided ? mergeHeaders({}, normalizeHeaders(provided)) : undefined;
  return await sonioxTranscribeFile(resolved, audio, { model: resolved.raw.model }, logger);
}
