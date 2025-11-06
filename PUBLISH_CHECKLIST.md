# SARAUDIO Publishing Checklist

This checklist is for automated releases via GitHub Actions.

## Before Creating Changeset ✅

- [ ] All packages build successfully (`pnpm build`)
- [ ] Tests pass (`pnpm test`)
- [ ] TypeScript checks pass (`pnpm typecheck`)
- [ ] Lint passes (`pnpm lint`)

## Creating Changeset 📝

```bash
# 1. Create changeset describing your changes
pnpm changeset

# 2. Select affected packages (or use defaults for linked versioning)
# 3. Choose bump type: patch/minor/major
# 4. Write clear changeset message

# 5. Commit changeset
git add .changeset/
git commit -m "chore: add changeset for [feature/fix]"
git push origin main
```

## After Pushing to Main 🤖

GitHub Actions will automatically:

1. ✅ Run tests and checks
2. ✅ Create/update "Version Packages" PR
3. ⏸️ Wait for you to review and merge PR
4. ✅ Publish to npm with `latest` tag
5. ✅ Create grouped GitHub release with commit tables
6. ✅ Push git tags

## Review "Version Packages" PR 🔍

Before merging, check:

- [ ] Version bumps are correct in all package.json files
- [ ] CHANGELOGs have proper entries
- [ ] CI checks pass (build, test, lint, typecheck)

## Post-publish Verification 📦

After PR is merged, verify:

```bash
# Check npm packages are published
npm view @saraudio/core
npm view @saraudio/react
npm view @saraudio/runtime-browser

# Check GitHub release created
gh release view v[VERSION]

# Test installation
mkdir test-install && cd test-install
npm init -y
npm install @saraudio/react @saraudio/vad-energy
```

## Manual Publishing (Emergency) 🚨

If automation fails:

```bash
# 1. Publish to npm
pnpm changeset publish

# 2. Create GitHub release
node scripts/create-github-release.mts

# 3. Push tags
git push --follow-tags
```