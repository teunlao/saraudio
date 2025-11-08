---
"@saraudio/deepgram": minor
---

Add JWT/ephemeral token support with secure authentication flow

- Auto-detect JWT vs API key and use correct WebSocket subprotocol (bearer/token)
- Mask tokens in error messages for security
- Improve error reporting with URL context
- Support ephemeral tokens for browser-safe authentication
