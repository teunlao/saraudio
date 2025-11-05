# For AI Agents

**Project:** SARAUDIO - Multi-source audio stack for AI apps.

**Read `.lab/` first** - context, vision, decisions.

**Coding:** `.lab/designs/coding-standards-2025-10-26.md` - NO `any`, minimize `as`.

**Workflow:** `.lab/designs/development-workflow-2025-10-26.md` - after EVERY change: typecheck → lint → test.

**Tests:** Unit tests `.test.ts` next to the file. Integration tests and fixtures in `__tests__/`.

**CRITICAL: File Reading Rule** - ALWAYS re-read a file with Read tool BEFORE editing it. Files can change (by user, linter, or other agents). Never edit based on old content.

---

## Commands

### Package-specific commands
Run checks for a specific package:
```bash
pnpm --filter @saraudio/runtime-browser typecheck
pnpm --filter @saraudio/runtime-browser lint
pnpm --filter @saraudio/runtime-browser lint:fix
pnpm --filter @saraudio/runtime-browser test
```

### Workspace-wide commands
Run checks for ALL packages:
```bash
pnpm typecheck  # TypeScript check all packages
pnpm lint       # Biome lint all packages
pnpm lint:fix   # Biome auto-fix all packages
pnpm test       # Vitest run all packages
```

### Development flow
After EVERY code change:
1. **Typecheck**: `pnpm --filter @saraudio/PACKAGE typecheck`
2. **Lint**: `pnpm --filter @saraudio/PACKAGE lint`
3. **Test**: `pnpm --filter @saraudio/PACKAGE test`

Example:
```bash
# After editing packages/runtime-browser/src/runtime.ts
pnpm --filter @saraudio/runtime-browser typecheck
pnpm --filter @saraudio/runtime-browser lint
pnpm --filter @saraudio/runtime-browser test
```

### Available packages
- `@saraudio/core` - Pipeline, stages, events
- `@saraudio/utils` - Logger, DSP utils (rms, int16/float32)
- `@saraudio/vad-energy` - Energy-based VAD stage
- `@saraudio/runtime-browser` - Browser runtime (MediaRecorder, AudioWorklet)

---

## Type Safety (VERY IMPORTANT)

Absolutely follow these rules when writing or editing TypeScript. These are hard constraints unless the owner explicitly approves an exception.

- WARNING: Never use `as any`.
- WARNING: Never chain casts like `as unknown as T`.
- WARNING: Do not add redundant `as T` when the compiler can infer the type.
- WARNING: Do not use non-null assertion `!` unless you add a one-line justification comment explaining why it is safe at that point.
- Do not use `@ts-ignore` or `@ts-expect-error` without a tracking note (why it’s needed and when to remove). Prefer fixing types.
- Prefer optional chaining and nullish coalescing: `obj?.prop`, `value ?? defaultValue` over brittle runtime checks.
- When narrowing is truly needed, create a small, named type guard (e.g., `function isStage(x): x is Stage`) next to where it’s used. Keep it minimal and testable.
- Public APIs should not accept `any` or `unknown` without a clear, typed boundary. Model the real types and let inference do the work.

Checklist before you finish a change:
- `rg -n " as any|as unknown"` returns no matches in touched files.
- No new non-null `!` assertions without a justification comment.
- No unnecessary `as` where inference already provides the type.

## React Hook Discipline

- Keep refs minimal. Do not introduce more than 1–2 `useRef` per hook without a clear reason. If you add one, leave a one-line reason in code.
- Do not recreate long‑lived objects on every render. Keep a single pipeline instance and reconfigure it; do not replace it unless strictly necessary.
- Async effects must clean up correctly. If an effect can resolve after unmount/remount, ensure cleanup prevents stale updates (AbortController or equivalent pattern).

## Pipeline Integration Contract

- A pipeline must be safe to receive frames before stages are fully configured. Use the core `Pipeline.configure({ stages })` to atomically apply stages; do not push partial stage sets piecemeal.
- Never drop frames: if configuration is pending, the pipeline buffers and flushes after `configure`.

---

## Pre‑merge Self‑Check

Run on the package you touched:

```bash
pnpm --filter @saraudio/PACKAGE typecheck
pnpm --filter @saraudio/PACKAGE lint
pnpm --filter @saraudio/PACKAGE test

# Assert no forbidden casts in your diff
rg -n " as any|as unknown" packages/<your-package>/src || true
```

---

## Git Usage Policy (MANDATORY)

- Absolutely no git operations without explicit user approval for the specific action.
- Forbidden without prior, explicit instruction from the owner/user: `git checkout`, `git reset`, `git revert`, `git commit`, `git merge`, `git rebase`, `git push`, `git pull`, `git fetch`, `git stash`, `git tag`, `git submodule` and any other git command.
- Do not modify, rename, or delete files with the intent of changing repository state as a substitute for git commands.
- If a git action is needed, first state the exact command you propose to run and wait for the user to approve it.
- This rule applies in all sessions and contexts, including tests, scripts, CI helpers, and local tooling.
