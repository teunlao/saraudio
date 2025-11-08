---
"@saraudio/core": minor
"@saraudio/deepgram": minor
"@saraudio/soniox": minor
"@saraudio/runtime-node": minor
---

feat: add unified session auth system for ephemeral tokens

- **@saraudio/core**: export SessionAuthAdapter, SessionAuthIssueResult, ProviderId types
- **@saraudio/deepgram**: add `/server` subpath export with sessionAuthAdapter
- **@saraudio/soniox**: add `/server` subpath export with sessionAuthAdapter
- **@saraudio/runtime-node**: add createSessionAuthHandler for unified endpoint

Unified API returns `{ token: string, expiresIn: number }` for both providers.
Server-side adapters use standard SessionAuthAdapter interface.
