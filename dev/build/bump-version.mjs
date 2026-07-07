#!/usr/bin/env node
// Bump the extension version in one shot, keeping the three version records in sync:
// extension/manifest.json (source of truth), package.json, package-lock.json.
//
//   node dev/build/bump-version.mjs patch|minor|major   → computed from the manifest
//   node dev/build/bump-version.mjs 1.2.3               → explicit version
//
// Prints ONLY the new version on stdout (workflows capture it).

import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join } from 'node:path';

const ROOT = new URL('../..', import.meta.url).pathname;
const MANIFEST = join(ROOT, 'extension/manifest.json');

const arg = process.argv[2];
if (!arg) {
  console.error('usage: bump-version.mjs <patch|minor|major|x.y.z>');
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
const current = manifest.version;

let next;
if (/^\d+\.\d+\.\d+$/.test(arg)) {
  next = arg;
} else {
  const [major, minor, patch] = current.split('.').map(Number);
  if (arg === 'major') next = `${major + 1}.0.0`;
  else if (arg === 'minor') next = `${major}.${minor + 1}.0`;
  else if (arg === 'patch') next = `${major}.${minor}.${patch + 1}`;
  else {
    console.error(`unknown bump "${arg}" (want patch|minor|major|x.y.z)`);
    process.exit(1);
  }
}

manifest.version = next;
writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);

// Sync package.json + package-lock.json without tagging (the release workflow tags).
execSync(`npm version ${next} --no-git-tag-version --allow-same-version`, {
  cwd: ROOT,
  stdio: ['ignore', 'ignore', 'inherit'],
});

process.stdout.write(`${next}\n`);
