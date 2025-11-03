# Releasing SARAUDIO

This document describes the release process for SARAUDIO packages.

## Prerequisites

1. **npm account**: You need an npm account with publish permissions
2. **Authentication**: Run `npm login` to authenticate
3. **Clean working directory**: Ensure all changes are committed

## Release Types

### Alpha/Beta Releases

For pre-release versions:

```bash
# 1. Create a changeset
pnpm changeset

# 2. Version packages with pre-release tag
pnpm changeset version --snapshot alpha

# 3. Build and test
pnpm build
pnpm test

# 4. Publish with tag
pnpm changeset publish --tag alpha
```

### Stable Releases

For production releases:

```bash
# 1. Create a changeset
pnpm changeset

# 2. Version packages
pnpm changeset version

# 3. Review and commit version changes
git add .
git commit -m "chore: version packages"

# 4. Build and test
pnpm build
pnpm test

# 5. Publish to npm
pnpm changeset publish

# 6. Push changes and tags
git push --follow-tags
```

## Package Configuration

All packages should have:

1. `"publishConfig": { "access": "public" }` in package.json
2. Proper `.npmignore` to exclude source files
3. `"files"` field listing what to include

## Versioning Strategy

- All `@saraudio/*` packages are versioned together (linked in changesets)
- Major version for breaking changes
- Minor version for new features
- Patch version for bug fixes

## First-time Publishing

If a package has never been published:

```bash
cd packages/[package-name]
npm publish --access public --tag alpha
```

## Troubleshooting

### "Package not found" error
- Ensure you're logged in: `npm whoami`
- Check package doesn't exist: `npm view @saraudio/[package]`

### "No auth token" error
- Run `npm login`
- Check `~/.npmrc` has auth token

### Build failures
- Run `pnpm clean` in all packages
- Delete `node_modules` and reinstall