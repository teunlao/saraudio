#!/usr/bin/env node
/**
 * Create a single grouped GitHub release for all @saraudio packages
 * Similar to Angular's release format with commit tables
 */

import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const PACKAGES_DIR = 'packages';
const SCOPE = '@saraudio';
const REPO_URL = 'https://github.com/teunlao/silence-aware-recorder';

interface CommitInfo {
  hash: string;
  type: string; // 'feat' | 'fix' | 'chore' | 'refactor' etc
  message: string;
}

interface PackageInfo {
  name: string;
  version: string;
  commits: CommitInfo[];
}

// Get version from first package (all linked, same version)
function getVersion(): string {
  const pkg = JSON.parse(readFileSync(join(PACKAGES_DIR, 'core/package.json'), 'utf-8'));
  return pkg.version;
}

// Parse CHANGELOG to extract commits
function parseChangelog(changelogPath: string): CommitInfo[] {
  try {
    const changelog = readFileSync(changelogPath, 'utf-8');

    // Extract content between ## <version> and next ## or end
    const versionMatch = changelog.match(/## \d+\.\d+\.\d+\s+([\s\S]*?)(?=\n## |\n*$)/);
    if (!versionMatch) return [];

    const content = versionMatch[1];
    const commits: CommitInfo[] = [];

    // Extract type from conventional commit message (feat: / fix: / chore: etc)
    const extractType = (message: string, defaultType: string): string => {
      const match = message.match(/^(feat|fix|chore|refactor|docs|test|perf|build|ci|style|revert)(\(.+?\))?:/);
      return match ? match[1] : defaultType;
    };

    // Parse Minor Changes (feat by default)
    // Format 1: "- abc1234: message" (with hash)
    // Format 2: "- message" (without hash, pre-publish)
    const minorSection = content.match(/### Minor Changes([\s\S]*?)(?=\n### |$)/);
    if (minorSection) {
      const lines = minorSection[1].split('\n').filter(l => l.trim().startsWith('- '));
      for (const line of lines) {
        // Try to match with hash first
        const withHash = line.match(/^- ([a-f0-9]+): (.+)/);
        if (withHash) {
          const hash = withHash[1];
          const fullMessage = withHash[2].trim();
          const type = extractType(fullMessage, 'feat');
          const message = fullMessage.replace(/^(feat|fix|chore|refactor|docs|test|perf|build|ci|style|revert)(\(.+?\))?:\s*/, '');
          commits.push({ hash, type, message });
        } else {
          // Without hash (pre-publish state)
          const withoutHash = line.match(/^- (.+)/);
          if (withoutHash && !withoutHash[1].startsWith('Updated dependencies')) {
            const fullMessage = withoutHash[1].trim();
            const type = extractType(fullMessage, 'feat');
            const message = fullMessage.replace(/^(feat|fix|chore|refactor|docs|test|perf|build|ci|style|revert)(\(.+?\))?:\s*/, '');
            commits.push({ hash: 'pending', type, message });
          }
        }
      }
    }

    // Parse Patch Changes (fix by default)
    const patchSection = content.match(/### Patch Changes([\s\S]*?)(?=\n### |$)/);
    if (patchSection) {
      const lines = patchSection[1].split('\n').filter(l => l.trim().startsWith('- '));
      for (const line of lines) {
        const withHash = line.match(/^- ([a-f0-9]+): (.+)/);
        if (withHash) {
          const hash = withHash[1];
          const fullMessage = withHash[2].trim();
          const type = extractType(fullMessage, 'fix');
          const message = fullMessage.replace(/^(feat|fix|chore|refactor|docs|test|perf|build|ci|style|revert)(\(.+?\))?:\s*/, '');
          commits.push({ hash, type, message });
        } else {
          const withoutHash = line.match(/^- (.+)/);
          if (withoutHash && !withoutHash[1].startsWith('Updated dependencies')) {
            const fullMessage = withoutHash[1].trim();
            const type = extractType(fullMessage, 'fix');
            const message = fullMessage.replace(/^(feat|fix|chore|refactor|docs|test|perf|build|ci|style|revert)(\(.+?\))?:\s*/, '');
            commits.push({ hash: 'pending', type, message });
          }
        }
      }
    }

    return commits;
  } catch {
    return [];
  }
}

// Get all packages with their commits
function getPackages(): PackageInfo[] {
  const packages: PackageInfo[] = [];

  const packagesOutput = execSync('pnpm -r --filter "@saraudio/*" list --json', {
    encoding: 'utf-8'
  });

  const packagesList = JSON.parse(packagesOutput);

  for (const pkg of packagesList) {
    const name = pkg.name.replace(`${SCOPE}/`, '');
    const changelogPath = join(pkg.path, 'CHANGELOG.md');
    const commits = parseChangelog(changelogPath);

    if (commits.length > 0) {
      packages.push({
        name,
        version: pkg.version,
        commits
      });
    }
  }

  // Filter out "common" commits that appear in ALL packages (from linked versioning)
  // Keep only packages with unique changes
  if (packages.length > 1) {
    // Find commits that appear in ALL packages (by hash)
    const allCommitHashes = packages.flatMap(p => p.commits.map(c => c.hash));
    const commonHashes = allCommitHashes.filter((hash) => {
      // Count how many packages have this hash
      const count = packages.filter(p => p.commits.some(c => c.hash === hash)).length;
      return count === packages.length; // Appears in ALL packages
    });

    // Remove common commits from all packages
    for (const pkg of packages) {
      pkg.commits = pkg.commits.filter(c => !commonHashes.includes(c.hash));
    }

    // Remove packages with no remaining commits
    const filteredPackages = packages.filter(p => p.commits.length > 0);

    // Special case: if all packages were filtered out (first release with common commits)
    // Show commits in the first package (core) as representative
    if (filteredPackages.length === 0 && packages.length > 0) {
      const corePackage = packages.find(p => p.name === 'core') || packages[0];
      // Restore original commits for this package
      const originalCore = packages.find(p => p.name === corePackage.name);
      if (originalCore) {
        return [originalCore].sort((a, b) => a.name.localeCompare(b.name));
      }
    }

    return filteredPackages.sort((a, b) => a.name.localeCompare(b.name));
  }

  return packages.sort((a, b) => a.name.localeCompare(b.name));
}

// Generate badge color based on commit type
function getBadgeColor(type: string): string {
  const colors: Record<string, string> = {
    feat: '00d084',     // green
    fix: 'green',       // green
    chore: 'lightgrey', // gray
    refactor: 'blue',   // blue
    docs: 'informational', // blue
    test: 'yellow',     // yellow
  };
  return colors[type] || 'lightgrey';
}

// Generate commit table row
function generateCommitRow(commit: CommitInfo): string {
  if (commit.hash === 'pending') {
    // No link for pending commits
    const badgeUrl = `https://img.shields.io/badge/pending-${commit.type}-${getBadgeColor(commit.type)}`;
    return `| ![${commit.type} - pending](${badgeUrl}) | ${commit.message} |`;
  }

  const shortHash = commit.hash.substring(0, 10);
  const badgeUrl = `https://img.shields.io/badge/${shortHash}-${commit.type}-${getBadgeColor(commit.type)}`;
  const commitUrl = `${REPO_URL}/commit/${commit.hash}`;

  return `| [![${commit.type} - ${shortHash}](${badgeUrl})](${commitUrl}) | ${commit.message} |`;
}

// Generate release body with Angular-style formatting
function generateReleaseBody(packages: PackageInfo[]): string {
  let body = '';

  for (const pkg of packages) {
    body += `### ${pkg.name}\n`;
    body += `| Commit | Description |\n`;
    body += `| -- | -- |\n`;

    for (const commit of pkg.commits) {
      body += `${generateCommitRow(commit)}\n`;
    }

    body += '\n';
  }

  return body.trim();
}

// Main
async function main() {
  const version = getVersion();
  console.log(`Creating grouped release for v${version}...`);

  const packages = getPackages();

  if (packages.length === 0) {
    console.log('No packages with commits found');
    return;
  }

  const releaseBody = generateReleaseBody(packages);
  const releaseTag = `v${version}`;
  const releaseTitle = `${version}`;

  // Write body to temp file to avoid shell escaping issues
  const tmpFile = `/tmp/release-body-${Date.now()}.md`;
  const { writeFileSync, unlinkSync } = await import('node:fs');
  writeFileSync(tmpFile, releaseBody);

  try {
    // Create grouped release
    execSync(
      `gh release create "${releaseTag}" --title "${releaseTitle}" --notes-file "${tmpFile}"`,
      { stdio: 'inherit' }
    );

    console.log(`✓ Created grouped release: ${releaseTag}`);
    console.log(`  Packages: ${packages.map(p => p.name).join(', ')}`);
  } finally {
    unlinkSync(tmpFile);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
