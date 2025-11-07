#!/usr/bin/env node
// Verify that platform packages share the same MAJOR version.
// Platform set: core, utils, runtime-base, runtime-browser, vue
// Fails with exit 1 when majors diverge.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const platform = [
  { name: '@saraudio/core', dir: 'packages/core' },
  { name: '@saraudio/utils', dir: 'packages/utils' },
  { name: '@saraudio/runtime-base', dir: 'packages/runtime-base' },
  { name: '@saraudio/runtime-browser', dir: 'packages/runtime-browser' },
  { name: '@saraudio/vue', dir: 'packages/vue' },
];

function readVersion(path) {
  const pkg = JSON.parse(readFileSync(path, 'utf8'));
  return String(pkg.version || '0.0.0');
}

function majorOf(v) {
  const m = /^\s*(\d+)\./.exec(v);
  return m ? Number(m[1]) : 0;
}

const versions = platform.map((p) => {
  const v = readVersion(join(root, p.dir, 'package.json'));
  return { ...p, version: v, major: majorOf(v) };
});

const majors = new Set(versions.map((x) => x.major));
if (majors.size <= 1) {
  console.log('[verify-platform-major] OK:', versions.map((x) => `${x.name}@${x.version}`).join(', '));
  process.exit(0);
}

console.error('\n[verify-platform-major] MISMATCH: platform package MAJOR versions diverged');
for (const v of versions) {
  console.error(` - ${v.name} => ${v.version}`);
}
console.error('\nExpected all platform packages to share the same MAJOR.');
console.error('If introducing a breaking change, create a changeset that bumps MAJOR for the whole platform group.');
console.error('Helper: pnpm changeset:platform-major');
process.exit(1);

