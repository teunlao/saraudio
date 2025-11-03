# SARAUDIO v3.0.0-alpha.1 Publishing Checklist

## Pre-flight Checks ✅

- [x] All packages build successfully
- [x] Tests pass
- [x] TypeScript checks pass
- [x] Changesets applied
- [x] Version bumped to alpha
- [x] CHANGELOG updated
- [x] README updated
- [x] GitHub workflows configured
- [x] .npmignore files in place

## Publishing Steps 📦

### 1. Authenticate with npm
```bash
npm login
# or if you have a token:
# npm config set //registry.npmjs.org/:_authToken=YOUR_TOKEN
```

### 2. Verify you're logged in
```bash
npm whoami
```

### 3. Dry run (optional but recommended)
```bash
pnpm publish --dry-run --no-git-checks
```

### 4. Publish alpha release
```bash
pnpm changeset publish --tag alpha
```

### 5. Create and push git tag
```bash
git tag v3.0.0-alpha.1
git push origin v3
git push origin v3.0.0-alpha.1
```

### 6. Create GitHub Release
Go to https://github.com/teunlao/silence-aware-recorder/releases/new
- Tag: v3.0.0-alpha.1
- Title: SARAUDIO v3.0.0-alpha.1
- Mark as pre-release
- Add release notes from CHANGELOG.md

## Post-publish Verification 🔍

### Check npm packages:
```bash
npm view @saraudio/core@alpha
npm view @saraudio/runtime-browser@alpha
npm view @saraudio/react@alpha
# ... check other packages
```

### Test installation:
```bash
mkdir test-install
cd test-install
npm init -y
npm install @saraudio/react@alpha @saraudio/vad-energy@alpha
```

## Announcement Template 📢

```
🎉 SARAUDIO v3.0.0-alpha.1 is now available!

This is a complete rewrite with:
- 🚀 10ms latency with AudioWorklet
- 📦 Modular architecture
- 🔧 Framework bindings (React, Vue, Svelte, Solid)
- 🎯 Smart segmentation with VAD
- 📉 6x smaller bundle size

Install: npm install @saraudio/react@alpha

Docs & examples: https://github.com/teunlao/silence-aware-recorder/tree/v3
```