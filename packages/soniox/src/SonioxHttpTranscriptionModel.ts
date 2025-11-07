/**
 * Soniox HTTP API models (as of Nov 2025).
 * Covers: Temporary API Keys, Files Upload, Transcriptions (create/get), Transcript retrieval.
 * Sources:
 * - Auth (Temporary Keys): https://soniox.com/docs/stt/api-reference/auth/create_temporary_api_key
 * - Files (Upload): https://soniox.com/docs/stt/api-reference/files/upload_file
 * - Transcriptions: https://soniox.com/docs/stt/api-reference/transcriptions
 */

/**
 * Common error envelope used by Soniox REST endpoints.
 */
export interface SonioxHttpErrorEnvelope {
  /** HTTP status code of the error. */
  status_code: number;
  /** Machine‑readable error type (e.g., 'unauthenticated', 'invalid_request', 'internal_error'). */
  error_type: string;
  /** Human‑readable message describing the error. */
  message: string;
  /** Optional list of validation error objects. */
  validation_errors?: ReadonlyArray<{
    /** Validation error type or code. */
    error_type?: string;
    /** Where the error occurred (field/path). */
    location?: string;
    /** Human‑readable validation message. */
    message?: string;
  }>;
  /** Request correlation identifier assigned by the server. */
  request_id?: string;
}

/**
 * POST /v1/auth/temporary-api-keys — Create a temporary API key for WebSocket usage.
 */
export interface SonioxHttpCreateTempKeyRequest {
  /** Usage type; must be 'transcribe_websocket' for realtime streaming. */
  usage_type: 'transcribe_websocket';
  /** Expiration in seconds (1..3600). */
  expires_in_seconds: number;
  /** Optional client reference for tracing (≤ 256 chars). */
  client_reference_id?: string;
}

/**
 * Response of Create Temporary API Key.
 */
export interface SonioxHttpCreateTempKeyResponse {
  /** The newly issued temporary API key string. */
  api_key: string;
  /** Expiration timestamp (RFC 3339, UTC). */
  expires_at: string;
}

/**
 * POST /v1/files — Upload a media file for batch transcription.
 * Multipart form: field 'file' is required; 'client_reference_id' optional.
 */
export interface SonioxHttpUploadFileResponse {
  /** Server‑assigned file id (UUID). */
  id: string;
  /** Original or stored filename. */
  filename: string;
  /** File size in bytes. */
  size: number;
  /** Upload creation timestamp (UTC). */
  created_at: string;
  /** Optional echo of client reference id. */
  client_reference_id?: string | null;
}

/**
 * POST /v1/transcriptions — Create a transcription job for a URL or previously uploaded file.
 */
export interface SonioxHttpCreateTranscriptionRequest {
  /** Async model identifier to use for batch processing. */
  model: string;
  /** HTTPS URL pointing to the audio content; mutually exclusive with file_id. */
  audio_url?: string;
  /** Uploaded file id (UUID); mutually exclusive with audio_url. */
  file_id?: string;
  /** Expected languages (BCP‑47). */
  language_hints?: ReadonlyArray<string>;
  /** Enable per‑segment speaker diarization. */
  enable_speaker_diarization?: boolean;
  /** Enable automatic language identification. */
  enable_language_identification?: boolean;
  /** Optional translation configuration (one‑way/two‑way). */
  translation?: Record<string, unknown>;
  /** Domain/context information to guide recognition and formatting. */
  context?: Record<string, unknown> | string;
  /** HTTPS callback URL to receive completion/error notifications. */
  webhook_url?: string;
  /** Webhook auth header name to include with callbacks. */
  webhook_auth_header_name?: string;
  /** Webhook auth header value to include with callbacks. */
  webhook_auth_header_value?: string;
  /** Optional client reference id for tracing. */
  client_reference_id?: string;
}

/**
 * Response to Create Transcription (201) and shape for subsequent GET /v1/transcriptions/{id}.
 */
export interface SonioxHttpTranscriptionResource {
  /** Transcription job id (UUID). */
  id: string;
  /** Processing status. */
  status: 'queued' | 'processing' | 'completed' | 'error';
  /** Creation timestamp (UTC). */
  created_at: string;
  /** Model identifier used for the job. */
  model: string;
  /** Source audio URL if provided. */
  audio_url: string | null;
  /** Uploaded file id (UUID) if used. */
  file_id: string | null;
  /** Original filename for the uploaded file. */
  filename?: string | null;
  /** Echo of language hints. */
  language_hints: ReadonlyArray<string> | null;
  /** Echo of context object or string. */
  context: Record<string, unknown> | string | null;
  /** Whether diarization was enabled. */
  enable_speaker_diarization: boolean;
  /** Whether language identification was enabled. */
  enable_language_identification: boolean;
  /** Duration of the audio in milliseconds, once known. */
  audio_duration_ms?: number;
  /** Machine‑readable error type when failed. */
  error_type?: string | null;
  /** Human‑readable error message when failed. */
  error_message?: string | null;
  /** Webhook URL if configured. */
  webhook_url?: string | null;
  /** Webhook auth header name if configured. */
  webhook_auth_header_name?: string | null;
  /** Webhook auth header value; may be masked in responses. */
  webhook_auth_header_value?: string | null;
  /** HTTP status code of the last webhook delivery attempt, if any. */
  webhook_status_code?: number | null;
  /** Client reference id for tracing. */
  client_reference_id?: string | null;
}

/**
 * GET /v1/transcriptions/{id}/transcript — Retrieve the finalized transcript and tokens.
 */
export interface SonioxHttpTranscriptResponse {
  /** Transcription id (UUID). */
  id: string;
  /** Full transcript text for the processed audio. */
  text: string;
  /** Token‑level details including timings and confidence. */
  tokens: ReadonlyArray<{
    /** Token text. */
    text: string;
    /** Token start timestamp in milliseconds. */
    start_ms: number;
    /** Token end timestamp in milliseconds. */
    end_ms: number;
    /** Confidence score in [0.0 .. 1.0]. */
    confidence: number;
    /** Optional speaker label/index when diarization enabled. */
    speaker?: number | string;
    /** Optional language of the token (BCP‑47). */
    language?: string;
  }>;
}
