**READING FILES:** ALWAYS read files COMPLETELY. NEVER use limit/offset. ALWAYS read FULL file content.
**READING FILES:** ALWAYS read files COMPLETELY. NEVER use limit/offset. ALWAYS read FULL file content.
**READING FILES:** ALWAYS read files COMPLETELY. NEVER use limit/offset. ALWAYS read FULL file content.
**READING FILES:** ALWAYS read files COMPLETELY. NEVER use limit/offset. ALWAYS read FULL file content.
**READING FILES:** ALWAYS read files COMPLETELY. NEVER use limit/offset. ALWAYS read FULL file content.
**READING FILES:** ALWAYS read files COMPLETELY. NEVER use limit/offset. ALWAYS read FULL file content.
**READING FILES:** ALWAYS read files COMPLETELY. NEVER use limit/offset. ALWAYS read FULL file content.
**READING FILES:** ALWAYS read files COMPLETELY. NEVER use limit/offset. ALWAYS read FULL file content.
**READING FILES:** ALWAYS read files COMPLETELY. NEVER use limit/offset. ALWAYS read FULL file content.
**READING FILES:** ALWAYS read files COMPLETELY. NEVER use limit/offset. ALWAYS read FULL file content.

**Git commits:** NO promotional links, NO "Generated with Claude Code", NO "Co-Authored-By: Claude".
**Git commits:** NO promotional links, NO "Generated with Claude Code", NO "Co-Authored-By: Claude".
**Git commits:** NO promotional links, NO "Generated with Claude Code", NO "Co-Authored-By: Claude".
**Git commits:** NO promotional links, NO "Generated with Claude Code", NO "Co-Authored-By: Claude".
**Git commits:** NO promotional links, NO "Generated with Claude Code", NO "Co-Authored-By: Claude".
**Git commits:** KEEP IT SHORT. NO detailed descriptions unless asked. Just "type(scope): what changed".

**Project:** SARAUDIO - Multi-source audio stack for AI-native apps.

**Core:** AudioWorklet pipeline, VAD, multi-source (mic + desktop).

**Start here:** `.lab/` - context and active work.

**Coding:** `.lab/designs/coding-standards-2025-10-26.md` - NO `any`, minimize `as`.

**Workflow:** `.lab/designs/development-workflow-2025-10-26.md` - after EVERY change: typecheck → lint → test.

**Tests:** Unit tests `.test.ts` next to the file. Integration tests and fixtures in `__tests__/`.

**Git commits:** NO promotional links, NO "Generated with Claude Code", NO "Co-Authored-By: Claude".
**Git commits:** NO promotional links, NO "Generated with Claude Code", NO "Co-Authored-By: Claude".
**Git commits:** NO promotional links, NO "Generated with Claude Code", NO "Co-Authored-By: Claude".
**Git commits:** NO promotional links, NO "Generated with Claude Code", NO "Co-Authored-By: Claude".
**Git commits:** NO promotional links, NO "Generated with Claude Code", NO "Co-Authored-By: Claude".
**Git commits:** KEEP IT SHORT. NO detailed descriptions unless asked. Just "type(scope): what changed".

---

## Task Execution Rules

**CRITICAL: Read ALL Related Files FIRST**

Before starting ANY task:
1. Read ALL files related to the problem - 10, 20, 30 files if needed
2. Read files that can influence the "correct implementation"
3. NEVER guess or assume what you don't know
4. NEVER work based on assumptions - only on actual file content

Example: If implementing a feature in `runtime.ts`:
- Read `runtime.ts` (main file)
- Read type definitions it imports
- Read related files in same directory
- Read test files to understand expected behavior
- Read documentation/ADRs about the feature
- Read example usage if exists

**Better to read 30 files than make wrong assumptions.**

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
