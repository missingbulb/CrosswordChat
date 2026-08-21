#!/usr/bin/env node
// The extension's version bump — `X.Y.Z` across the two files that must stay in
// sync, the manifest and package.json — printing the new version (and writing it
// to GITHUB_OUTPUT as `version`). Vendored into each extension repo's own
// .github/actions/; dependency-free (node: built-ins only) so it runs on a bare
// runner with no npm ci.
//
// WHO RUNS IT. The routine bump belongs to the CHANGE, not to the pipeline: a PR
// that touches a shipped file raises the patch in the same PR (the pack's
// `cer/version-bumped` check holds that line), and the release flow ships
// whatever version it finds on main. The pipeline runs this only for the
// deliberate minor/major bump, dispatched by hand — the "new feature" / "new
// generation" statement that belongs to no single change.
//
// THE DIRECTORY IS STILL NAMED bump-extension-patch, and it now bumps any part.
// The path is vendored into every extension repo, so renaming it would leave the
// old copy sitting in each of them with nothing able to remove it; a name that
// has outlived its scope is the cheaper of those two, the same call the `cer/`
// check-id prefix carries.
//
// WRITING. Each file is edited by replacing the exact `"version": "<old>"` token
// (which must appear exactly once per file — the cer/version-sync invariant)
// rather than JSON.parse/stringify, so formatting is preserved and the diff is
// one line. The package-lock.json root version is intentionally NOT touched: npm
// ci does not gate on it, and rewriting it churns the lockfile. Both files are
// validated before either is written, so a failure never leaves a half-bumped
// tree.
//
// Args: <manifest_path> <package_json_path> [--minor|--major] [--print].

import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const VERSION_RE = /^(\d+)\.(\d+)\.(\d+)$/;

export class BumpError extends Error {}

export function parseVersion(version, where) {
  const m = VERSION_RE.exec(version ?? '');
  if (!m) throw new BumpError(`version '${version}'${where ? ` in ${where}` : ''} is not X.Y.Z`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

// -1/0/1 for a < b / a == b / a > b. Lives here beside the scheme rather than
// beside either of its callers — the pack's `cer/version-bumped` check asks
// whether a change raised the version, and the release flow asks whether main is
// ahead of the store.
export function compare(a, b) {
  const [x, y] = [parseVersion(a), parseVersion(b)];
  for (let i = 0; i < 3; i += 1) {
    if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1;
  }
  return 0;
}

// The next version after `current`. `patch` is what a shipped change raises;
// `minor` and `major` are the deliberate statements, and each resets everything
// below it so the result is strictly greater whatever it started from.
export function nextVersion(current, part = 'patch') {
  const [major, minor, patch] = parseVersion(current);
  if (part === 'major') return `${major + 1}.0.0`;
  if (part === 'minor') return `${major}.${minor + 1}.0`;
  if (part === 'patch') return `${major}.${minor}.${patch + 1}`;
  throw new BumpError(`unknown version part '${part}' — one of patch, minor, major`);
}

// Read the version out of a JSON version record without parsing it, so the same
// single-occurrence rule the rewrite depends on is the one that reads it.
export function readVersion(path, text) {
  const m = /"version":\s*"([^"]+)"/.exec(text ?? '');
  if (!m) throw new BumpError(`${path} carries no "version" field`);
  return m[1];
}

export function rewrite(path, text, current, next) {
  const oldToken = `"version": "${current}"`;
  const occurrences = text.split(oldToken).length - 1;
  if (occurrences !== 1) {
    throw new BumpError(`expected exactly one ${oldToken} in ${path}, found ${occurrences} — the two version records must agree before a bump`);
  }
  return text.replace(oldToken, `"version": "${next}"`);
}

export function bump(files, part = 'patch', { read = (f) => readFileSync(f, 'utf8'), write = writeFileSync } = {}) {
  if (files.length !== 2) throw new BumpError('usage: bump.mjs <manifest_path> <package_json_path> [--minor|--major] [--print]');
  const texts = files.map((f) => [f, read(f)]);
  const current = readVersion(texts[0][0], texts[0][1]);
  const next = nextVersion(current, part);
  // Validate every file first; only then write, so a mid-run failure can't leave
  // the two version records disagreeing.
  const writes = texts.map(([f, text]) => [f, rewrite(f, text, current, next)]);
  for (const [f, text] of writes) write(f, text);
  return next;
}

// `--print` reads the version instead of raising it, and exists so nothing else
// has to know where the version lives: the release pipeline needs the version
// currently on `main` to decide whether it has been released yet, and asking the
// script that writes the version is what keeps that in one place.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const argv = process.argv.slice(2);
    const files = argv.filter((a) => !a.startsWith('--'));
    const part = argv.includes('--major') ? 'major' : argv.includes('--minor') ? 'minor' : 'patch';
    const version = argv.includes('--print')
      ? readVersion(files[0], readFileSync(files[0], 'utf8'))
      : bump(files, part);
    if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `version=${version}\n`);
    console.log(version);
  } catch (err) {
    console.error(`bump-extension-version: ${err.message}`);
    process.exit(1);
  }
}
