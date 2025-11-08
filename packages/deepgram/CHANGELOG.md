## 0.0.2

## 0.2.0

### Minor Changes

- f66709f: feat: add unified session auth system for ephemeral tokens

  - **@saraudio/core**: export SessionAuthAdapter, SessionAuthIssueResult, ProviderId types
  - **@saraudio/deepgram**: add `/server` subpath export with sessionAuthAdapter
  - **@saraudio/soniox**: add `/server` subpath export with sessionAuthAdapter
  - **@saraudio/runtime-node**: add createSessionAuthHandler for unified endpoint

  Unified API returns `{ token: string, expiresIn: number }` for both providers.
  Server-side adapters use standard SessionAuthAdapter interface.

### Patch Changes

- Updated dependencies [f66709f]
  - @saraudio/core@0.2.0

## 0.1.0

### Minor Changes

- b7d8d82: Add JWT/ephemeral token support with secure authentication flow

  - Auto-detect JWT vs API key and use correct WebSocket subprotocol (bearer/token)
  - Mask tokens in error messages for security
  - Improve error reporting with URL context
  - Support ephemeral tokens for browser-safe authentication

## 0.0.4

### Patch Changes

- Updated dependencies [7c7e90f]
  - @saraudio/core@0.1.1

## 0.0.3

### Patch Changes

- af17c99: Refactor to use shared HTTP/URL utilities from @saraudio/utils, removing duplicated helper functions
- Updated dependencies [af17c99]
- Updated dependencies [af17c99]
  - @saraudio/core@0.1.0
  - @saraudio/utils@0.1.0

### Patch Changes

- 18c0fb1: Initial release
- Updated dependencies [18c0fb1]
  - @saraudio/core@0.0.2
  - @saraudio/utils@0.0.2
