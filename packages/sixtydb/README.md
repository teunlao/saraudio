# @saraudio/sixtydb

60db **HTTP-only** transcription provider. Supports file uploads and saraudio's
existing segment-based HTTP runtime. No WebSocket stream or partial results.

```bash
pnpm add @saraudio/sixtydb
export SIXTYDB_API_KEY="your-api-key"
```

Server-side file transcription:

```ts
import { readFile } from 'node:fs/promises';
import { sixtydb } from '@saraudio/sixtydb';

const provider = sixtydb({
  auth: { apiKey: process.env.SIXTYDB_API_KEY },
  language: 'en', // omit or use 'auto' for language detection
});
const result = await provider.transcribe(await readFile('recording.wav'));
console.log(result.text);
```

The environment lookup belongs to your application; this package reads credentials
from `auth.getToken`, then `auth.token`, then `auth.apiKey`, in that priority order.
Each request resolves credentials again.
Keep long-lived API keys on your server. For browser deployments, use your own
backend proxy through `baseUrl` and appropriate authentication; do not embed a
workspace API key in shipped client code.

## Audio and runtime

`Uint8Array` and `ArrayBuffer` inputs must contain a WAV file, not raw PCM.
Use the existing `encodeWavPcm16` export from `@saraudio/core` for standalone PCM.
For other documented formats, pass a Blob with the corresponding audio MIME type
(e.g. `audio/mpeg`, `audio/ogg`, `audio/flac`, `audio/webm`, `audio/mp4`).

The recorder HTTP transport already converts PCM chunks to WAV. Select
`transport: 'http'`, mono 16 kHz recorder input, and `flushOnSegmentEnd: true` to
transcribe each completed speech segment. Reuse the existing HTTP quickstart;
replace its provider with `sixtydb(...)`. `stream()` is absent and the provider
reports `transports: { http: true, websocket: false }`.

## Options and results

- `language?: string`: language code, or omit/`auto` for detection.
- `diarization?: boolean`: request segment-level speaker labels (60db adds a surcharge).
- `context?: string`: plain-text session context; refinement depends on the workspace plan.
- `keywords?: string`: CSV vocabulary, optionally `term:weight`.
- Shared `auth`, `baseUrl`, `headers`, `query`, and `logger` options remain available.
- `transcribe(audio, { language, diarization }, signal)` overrides language and
  diarization for one call. JSON response formats are accepted; text/SRT/VTT are rejected.

Requests explicitly enable word timestamps and confidence. The normalized result
contains `text`, detected `language`, timed `words`, and an audio-duration `span`
in milliseconds when returned. Untimed words are omitted; no timings, word-level
speaker IDs, or aggregate confidence are invented. The full response is preserved
in `metadata`, including `segments`, their raw `speakers` arrays, `duration_sec`,
`warnings`, and `warning_codes`. Empty text for silence or low-SNR rejection is a
successful result; inspect its warnings.

Non-empty files are limited to 10,000,000 bytes before upload. The current endpoint
reference specifies 10 MB and one hour; the feature overview lists different
limits, so this adapter follows the stricter file-size limit. Duration validation
remains server-side. There is no model-selection field on the documented REST
request, so this adapter does not send one.

## Errors and cancellation

401/403 → `AuthenticationError`; 402/other rejection → `ProviderError`;
429 → `RateLimitError` with `retryAfterMs`; 5xx/network failures → `NetworkError`.
Malformed JSON/results and application errors fail clearly. AbortSignal cancellation
and HTTP 499 produce `AbortedError`. The provider never automatically retries
uploads; callers can apply backoff and honor `Retry-After` without duplicate work.

Contract tests cover request construction, WAV sample bytes, response mapping,
validation, errors, and cancellation. Live API transcription requires your key.

Reference: [60db REST STT](https://docs.60db.ai/api-reference/stt/speech-to-text).
