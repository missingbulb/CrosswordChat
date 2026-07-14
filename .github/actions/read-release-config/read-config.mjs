#!/usr/bin/env node
// Resolves a Chrome-extension repo's release configuration and prints it as
// GitHub Actions step outputs. Runs inside the CALLING repo's checkout (the
// reusable release workflows invoke it via the read-release-config composite
// action), so it reads the caller's own `.github/release.config`.
//
// `.github/release.config` is a dotenv-style file (KEY=value, `#` comments,
// blank lines ignored) and is REQUIRED — every key is mandatory, there are no
// silent defaults (a default that "happens to match" a repo's layout is exactly
// the drift risk this design avoids). A missing file or a missing/unknown key
// fails the run loudly. Required keys:
//
//   manifest_path       the extension manifest (the version source of truth)
//   package_json_path   the package.json kept in sync with the manifest
//   setup_command       dependency-install command ("" = no install, stated)
//   test_command        the full release test gate
//   ship_paths          space-separated shipped roots (the daily change filter)
//
// Two things are NOT keys because they are FORCED-uniform structure, not a
// per-repo choice: the build is always `npm run build`, and the zip lives at the
// standard place/name `dist/<kebab repo name>.zip` (derived here as `zip_path` +
// `zip_name`). A repo's build must write there.
//
// Env: REPO_NAME (github.event.repository.name) for the zip derivation;
// GITHUB_OUTPUT for the sink. Dependency-free (node: built-ins only).

import { readFileSync, existsSync, appendFileSync } from 'node:fs';

const CONFIG_PATH = '.github/release.config';

const REQUIRED_KEYS = [
  'manifest_path',
  'package_json_path',
  'setup_command',
  'test_command',
  'ship_paths',
];

function fail(msg) {
  console.error(`read-release-config: ${msg}`);
  process.exit(1);
}

// PascalCase / camelCase / ALLCAPS repo name -> kebab, for the standard zip name
// (GoogleCalendarEventCreator -> google-calendar-event-creator,
// CrosswordChat -> crossword-chat, TLDR -> tldr).
function kebab(name) {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2')
    .toLowerCase();
}

// setup_command may be empty (an explicit "no install") — present-but-empty is
// valid, absent is not.
function parseConfig(text) {
  const cfg = {};
  text.split('\n').forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith('#')) return;
    const eq = line.indexOf('=');
    if (eq === -1) fail(`${CONFIG_PATH}:${i + 1} is not KEY=value or a # comment: "${line}"`);
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    cfg[key] = value;
  });
  return cfg;
}

const repoName = process.env.REPO_NAME;
if (!repoName) fail('REPO_NAME env is required (github.event.repository.name).');

if (!existsSync(CONFIG_PATH)) {
  fail(`${CONFIG_PATH} is required — every extension repo declares its release config explicitly (see the chrome-extension-release standard in Claudinite).`);
}

const cfg = parseConfig(readFileSync(CONFIG_PATH, 'utf8'));

const missing = REQUIRED_KEYS.filter((k) => !(k in cfg));
if (missing.length) fail(`${CONFIG_PATH} is missing required key(s): ${missing.join(', ')}`);

const unknown = Object.keys(cfg).filter((k) => !REQUIRED_KEYS.includes(k));
if (unknown.length) fail(`${CONFIG_PATH} has unknown key(s): ${unknown.join(', ')} (valid: ${REQUIRED_KEYS.join(', ')})`);

const zipName = `${kebab(repoName)}.zip`;

const outputs = {
  manifest_path: cfg.manifest_path,
  package_json_path: cfg.package_json_path,
  setup_command: cfg.setup_command,
  test_command: cfg.test_command,
  ship_paths: cfg.ship_paths,
  // Forced-uniform structure: the build writes the zip here.
  zip_name: zipName,
  zip_path: `dist/${zipName}`,
};

const sink = process.env.GITHUB_OUTPUT;
if (!sink) {
  for (const [k, v] of Object.entries(outputs)) console.log(`${k}=${v}`);
  process.exit(0);
}

let block = '';
for (const [k, v] of Object.entries(outputs)) {
  block += `${k}<<__RELEASE_CFG__\n${v}\n__RELEASE_CFG__\n`;
}
appendFileSync(sink, block);
