/**
 * Soniox Real‑Time WebSocket API model (as of Nov 2025).
 * Source: Soniox docs – Real‑time WebSocket API
 * https://soniox.com/docs/stt/api-reference/websocket-api
 */

/**
 * Client → Server: initial JSON configuration sent immediately after opening the WebSocket.
 * After this message, the client streams binary audio frames.
 */
export interface SonioxWsInitConfig {
  /** API key or temporary key used to authorize the stream. */
  api_key: string;
  /** Real‑time model identifier (e.g., "stt-rt-v3" or "stt-rt-preview"). */
  model: string;
  /** Input audio format; e.g., "pcm_s16le" for raw PCM16 little‑endian, or "auto" to auto‑detect. */
  audio_format?: string;
  /** Number of audio channels for raw formats (1 or 2). */
  num_channels?: number;
  /** Sample rate in Hz for raw formats (e.g., 16000). */
  sample_rate?: number;
  /** List of expected languages (BCP‑47) to guide recognition, e.g., ["en","es"]. */
  language_hints?: ReadonlyArray<string>;
  /** Enable automatic speaker diarization (speaker labels in outputs). */
  enable_speaker_diarization?: boolean;
  /** Enable automatic language identification for the stream. */
  enable_language_identification?: boolean;
  /** Enable server‑side endpoint detection (utterance segmentation). */
  enable_endpoint_detection?: boolean;
  /** Client‑supplied correlation id for tracking across systems (≤ 256 chars). */
  client_reference_id?: string;
  /**
   * Optional context to improve accuracy and formatting; exact structure is provider‑defined.
   * Common subfields include domain hints (key/value), free text, domain terms, translation terms.
   */
  context?: unknown;
  /**
   * Optional translation configuration.
   * One‑way example: { type: 'one_way', target_language: 'en' }
   * Two‑way example: { type: 'two_way', language_a: 'en', language_b: 'es' }
   */
  translation?: Record<string, unknown>;
}

/**
 * Server → Client: streaming response message containing partial and/or final tokens and progress.
 */
export interface SonioxWsStreamResponse {
  /** Sequence of tokens (words/subwords) with metadata for this update. */
  tokens?: ReadonlyArray<SonioxWsToken>;
  /**
   * Duration of audio (ms) processed into final, immutable tokens at the time of this message.
   */
  final_audio_proc_ms?: number;
  /**
   * Duration of audio (ms) processed into final + non‑final tokens at the time of this message.
   */
  total_audio_proc_ms?: number;
}

/**
 * Token metadata included in Soniox WebSocket streaming messages.
 */
export interface SonioxWsToken {
  /** Token text (word/subword). */
  text?: string;
  /** Start timestamp of the token in milliseconds (may be omitted for translation‑only tokens). */
  start_ms?: number;
  /** End timestamp of the token in milliseconds (may be omitted for translation‑only tokens). */
  end_ms?: number;
  /** Confidence score in [0.0 .. 1.0]. */
  confidence?: number;
  /** True when the token is finalized and will not change in later updates. */
  is_final?: boolean;
  /** Speaker label/index when diarization is enabled. */
  speaker?: number | string;
  /** Language of the token text (BCP‑47), when available. */
  language?: string;
  /** Source language for translation tokens, when available. */
  source_language?: string;
  /** Translation state marker for translation tokens (provider‑specific values). */
  translation_status?: string;
}

/**
 * Server → Client: terminal message that indicates the stream is finished.
 * The server will typically close the socket after this response.
 */
export interface SonioxWsFinishedResponse {
  /** Usually empty at the end of stream; kept for schema consistency. */
  tokens?: ReadonlyArray<SonioxWsToken>;
  /** Final duration (ms) processed into final tokens. */
  final_audio_proc_ms: number;
  /** Total duration (ms) processed (final + non‑final). */
  total_audio_proc_ms: number;
  /** True indicates no further data will be sent. */
  finished: true;
}

/**
 * Server → Client: error message sent before closing the connection.
 */
export interface SonioxWsErrorResponse {
  /** Often present (possibly empty) for schema consistency. */
  tokens?: ReadonlyArray<SonioxWsToken>;
  /** HTTP‑like status code (e.g., 400, 401, 402, 408, 429, 500, 503). */
  error_code: number;
  /** Human‑readable description of the error. */
  error_message: string;
}
