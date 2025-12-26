---
"@saraudio/capture-darwin": patch
"@saraudio/capture-node": patch
---

Add OS-level System Audio Recording permission preflight, and harden macOS capture startup.

- `@saraudio/capture-darwin`: auto-fix missing executable bit on bundled `saraudio-capture`, add `--preflight-system-audio` (JSON), and avoid silent hangs on early stream failures.
- `@saraudio/capture-node`: expose `preflightSystemAudioPermission()` on macOS.

