#!/usr/bin/env node
// Create a changeset file that bumps MAJOR for the platform group.
// Usage: pnpm changeset:platform-major "feat: platform vX - brief reason"

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const message = process.argv.slice(2).join(' ').trim() || 'platform: coordinated major release';

const platform = [
  '@saraudio/core',
  '@saraudio/utils',
  '@saraudio/runtime-base',
  '@saraudio/runtime-browser',
  '@saraudio/runtime-node',
  '@saraudio/react',
  '@saraudio/vue',
  '@saraudio/svelte',
  '@saraudio/solid',
];

const id = `platform-major-${Date.now()}`;
const dir = '.changeset';
mkdirSync(dir, { recursive: true });
const file = join(dir, `${id}.md`);

const header = ['---', ...platform.map((p) => `'${p}': major`), '---'].join('\n');
const body = `\n${message}\n`;
writeFileSync(file, `${header}${body}`);
console.log(`Created ${file}`);
