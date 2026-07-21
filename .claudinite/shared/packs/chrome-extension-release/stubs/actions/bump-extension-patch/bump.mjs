#!/usr/bin/env node
// Bumps a Chrome extension's PATCH version (x.y.Z -> x.y.Z+1) in the two files
// that must stay in sync — the manifest and package.json — and prints the new
// version (and writes it to GITHUB_OUTPUT as `version`). The generic form of the
// per-repo patch-bumpers the daily auto-release used to require: the calling
// repo passes only its manifest/package paths (already release config), never a
// bump script, so the logic lives once here.
//
// Deliberate human bumps ("bump version", default minor) are a normal PR that
// edits the same files by hand — untouched by this; this is only the daily
// pipeline's automated patch step, which needs a version strictly higher than
// the live store one.
//
// Each file is edited by replacing the exact `"version": "<old>"` token (which
// must appear exactly once per file — the cer/version-sync invariant) rather
// than JSON.parse/stringify, so formatting is preserved and the diff is one
// line. The package-lock.json root version is intentionally NOT touched: npm ci
// does not gate on it, and rewriting it churns the lockfile. Both files are
// validated before either is written, so a failure never leaves a half-bumped
// tree. Dependency-free (node: built-ins only) — it runs on a bare runner.
//
// Args: <manifest_path> <package_json_path> (repo-relative, from release config).

import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';

function fail(msg) {
  console.error(`bump-extension-patch: ${msg}`);
  process.exit(1);
}

const [manifestPath, packageJsonPath] = process.argv.slice(2);
if (!manifestPath || !packageJsonPath) {
  fail('usage: bump.mjs <manifest_path> <package_json_path>');
}

let current;
try {
  current = JSON.parse(readFileSync(manifestPath, 'utf8')).version;
} catch (err) {
  fail(`cannot read ${manifestPath}: ${err.message}`);
}
const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(current ?? '');
if (!m) fail(`current version '${current}' in ${manifestPath} is not X.Y.Z`);
const next = `${m[1]}.${m[2]}.${Number(m[3]) + 1}`;

const oldToken = `"version": "${current}"`;
const newToken = `"version": "${next}"`;

// Validate every file first; only then write, so a mid-run failure can't leave
// the two version records disagreeing.
const writes = [];
for (const file of [manifestPath, packageJsonPath]) {
  const text = readFileSync(file, 'utf8');
  const occurrences = text.split(oldToken).length - 1;
  if (occurrences !== 1) {
    fail(`expected exactly one ${oldToken} in ${file}, found ${occurrences} — the two version records must agree before a bump`);
  }
  writes.push([file, text.replace(oldToken, newToken)]);
}
for (const [file, text] of writes) writeFileSync(file, text);

if (process.env.GITHUB_OUTPUT) {
  appendFileSync(process.env.GITHUB_OUTPUT, `version=${next}\n`);
}
console.log(next);
