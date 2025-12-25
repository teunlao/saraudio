# Releasing SARAUDIO

This document describes the automated release process for SARAUDIO packages.

## Prerequisites

1. **NPM_TOKEN**: Set in GitHub repository secrets for automated publishing (npm automation token with publish rights for the `@saraudio` scope).
2. **GitHub Actions permissions**: Enable “Allow GitHub Actions to create and approve pull requests”.
3. **Clean working directory**: Ensure all changes are committed to `main` branch.

## Automated Release Process

Releases are automated via GitHub Actions + Changesets:

1. **Create a changeset** describing your changes
2. **Merge to `main`** — the bot creates/updates “Version Packages” PR
3. **Merge the PR** — GitHub Actions will:
   - Publish to npm with `latest` tag
   - Create git tags (e.g., `v0.0.2`)
   - Create GitHub Releases (via `changesets/action`)

### Step-by-step

```bash
# 1. Create a changeset for your changes
pnpm changeset

# 2. Commit and push
git add .
git commit -m "feat(core): add new feature"
git push origin main
```

Then:
1) Wait for “Version Packages” PR to be created/updated  
2) Review and merge the PR  
3) The Release workflow publishes to npm and creates the GitHub Release

## Snapshot Releases (manual)

Use GitHub Actions → **Release Snapshot** to publish a snapshot dist-tag (`snapshot`, `alpha`, `beta`) from any branch.

## macOS Native Packages

`@saraudio/capture-darwin` bundles a native Swift/CoreAudio binary and requires macOS to build during `prepack`.
The Release workflows run on `macos-latest` so publishing includes a valid binary.

## Package Configuration

All published packages should have:

1. `"publishConfig": { "access": "public" }` in `package.json`
2. `"files"` field listing what to include in npm

## Versioning Strategy (Hybrid)

- Platform group (keeps MAJOR in sync):
  - `@saraudio/core`, `@saraudio/utils`, `@saraudio/runtime-base`, `@saraudio/runtime-browser`, `@saraudio/runtime-node`,
    UI bindings (`@saraudio/react`, `@saraudio/vue`, `@saraudio/svelte`, `@saraudio/solid`).
  - Any breaking change here → coordinated MAJOR bump for the whole group.
- Providers and stages (independent):
  - `@saraudio/deepgram`, `@saraudio/vad-energy`, `@saraudio/meter`, etc.
  - Minor/Patch release independently; MAJOR only when required by a new platform MAJOR.

Semver:
- Major for breaking change
- Minor for backward-compatible features
- Patch for fixes

## Manual Publishing (if needed)

```bash
pnpm changeset publish
```

Note: publishing `@saraudio/capture-darwin` requires macOS because `prepack` builds the native binary.

## Troubleshooting

### “Version Packages” PR not created

- Check GitHub Actions permissions: Settings → Actions → General
- Ensure “Allow GitHub Actions to create and approve pull requests” is enabled
- Verify `NPM_TOKEN` is set in repository secrets

### Release doesn’t publish

- Check that the Release workflow ran on `main` and the `changesets/action` step output shows `published: true`
- Verify `NPM_TOKEN` has publish rights for the `@saraudio` scope
