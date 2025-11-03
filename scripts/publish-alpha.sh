#!/bin/bash

# SARAUDIO Alpha Release Script

echo "🚀 SARAUDIO v3 Alpha Release Process"
echo "===================================="

# Check if we're on the right branch
CURRENT_BRANCH=$(git branch --show-current)
if [ "$CURRENT_BRANCH" != "v3" ]; then
    echo "❌ Error: Must be on v3 branch to release"
    echo "Current branch: $CURRENT_BRANCH"
    exit 1
fi

# Check if working directory is clean
if ! git diff-index --quiet HEAD --; then
    echo "❌ Error: Working directory has uncommitted changes"
    echo "Please commit or stash your changes before releasing"
    exit 1
fi

# Build all packages
echo "📦 Building packages..."
pnpm build

# Run tests
echo "🧪 Running tests..."
pnpm test

# Run type checking
echo "🔍 Type checking..."
pnpm typecheck

# Dry run first
echo ""
echo "🔍 Performing dry run..."
echo ""

# List what will be published
echo "The following packages will be published:"
echo ""

for package in packages/*/package.json; do
    if [ -f "$package" ]; then
        dir=$(dirname "$package")
        name=$(grep '"name"' "$package" | head -1 | cut -d'"' -f4)
        version=$(grep '"version"' "$package" | head -1 | cut -d'"' -f4)
        echo "  - $name@$version"
    fi
done

echo ""
echo "⚠️  This is an ALPHA release!"
echo ""
echo "To publish to npm, run:"
echo "  pnpm changeset publish --tag alpha"
echo ""
echo "After publishing, create a git tag:"
echo "  git tag v3.0.0-alpha.1"
echo "  git push origin v3.0.0-alpha.1"