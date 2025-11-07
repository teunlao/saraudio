#!/usr/bin/env node
import { appendFileSync } from 'node:fs';

const packagesEnv = process.env.PUBLISHED_PACKAGES;
const githubOutput = process.env.GITHUB_OUTPUT;

function setOutput(key, value) {
  if (!githubOutput) return;
  if (value && value.includes('\n')) {
    appendFileSync(githubOutput, `${key}<<EOF\n${value}\nEOF\n`);
  } else {
    appendFileSync(githubOutput, `${key}=${value ?? ''}\n`);
  }
}

let packages = [];
try {
  if (packagesEnv) packages = JSON.parse(packagesEnv);
} catch (error) {
  console.error('Failed to parse PUBLISHED_PACKAGES:', error);
}

if (!Array.isArray(packages) || packages.length === 0) {
  setOutput('should_release', 'false');
  process.exit(0);
}

const interesting = packages.filter((pkg) => pkg && pkg.type !== 'patch');
if (interesting.length === 0) {
  console.log('Only patch packages were published; skipping GitHub release.');
  setOutput('should_release', 'false');
  process.exit(0);
}

const tag = `release-${process.env.GITHUB_RUN_ID ?? Date.now()}`;
const title = `Release ${tag}`;
const body = interesting
  .map((pkg) => `- ${pkg.name}@${pkg.version} (${pkg.type})`)
  .join('\n');

setOutput('should_release', 'true');
setOutput('tag', tag);
setOutput('title', title);
setOutput('body', body);
