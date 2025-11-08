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

## 0.1.1

### Patch Changes

- 7c7e90f: Replace StageController.metadata with key field and improve matching logic with symmetric isEqual check

## 0.1.0

### Minor Changes

- af17c99: Add BaseProviderOptions with support for flexible headers, baseUrl builders, and query parameters

### Patch Changes

- Updated dependencies [af17c99]
  - @saraudio/utils@0.1.0

### Patch Changes

- 18c0fb1: Initial release
- Updated dependencies [18c0fb1]
  - @saraudio/utils@0.0.2
