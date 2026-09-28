#!/usr/bin/env node
// The declared packs' task declarations and dashboard descriptors, one file each under
// `.claudinite/flat/`. What it saves is reads: the dashboard renders members over the
// API, one request per file, and a session asking what runs here would otherwise open
// every `tasks/<name>/task.json` across the mount and the local packs.
//
// Each entry carries the source file's parsed JSON as written - no defaults, no
// normalisation - so every reader still runs the declaration through its own door, and
// the path it was read from, so a reader can name the file to change. A file that does
// not parse carries its text instead: the reader that renders it as unreadable is the one
// that already knows how.
//
// Session-copied packs (`temp`) are left out. They are untracked and per-person, and a
// committed file naming them would change with whoever ran the converge.
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadPacks, isActive } from './pack-registry.mjs';
import { settingsPath } from '../settings-file.mjs';
import { corpusRootFor } from './generate-rules-index.mjs';
import { FLAT_DIR } from './flat-dir.mjs';

export const FLAT_TASKS_FILE = join(FLAT_DIR, 'tasks.GENERATED.json');
export const FLAT_DASHBOARD_FILE = join(FLAT_DIR, 'dashboard.GENERATED.json');
export const FLAT_VERSION = 1;

const DESCRIPTOR_FILE = 'dashboard.json';
const posix = (p) => p.split(sep).join('/');

function declaredPacks(projectRoot) {
  const configPath = settingsPath(projectRoot);
  if (!existsSync(configPath)) return [];
  try {
    const raw = JSON.parse(readFileSync(configPath, 'utf8'));
    return Array.isArray(raw.packs) ? raw.packs : [];
  } catch { return []; }
}

// A pack's directory in the repo being written for: a local pack was discovered there
// already, a canon pack is re-rooted onto the target's corpus (the rules index's
// `corpusRootFor` says why the loaded directory can be a clone's).
const packDirIn = (pack, corpusRoot) => (pack.local ? pack.dir : join(corpusRoot, 'packs', pack.id));

// `{ path, declaration }` for a file that parses, `{ path, text }` for one that does not.
function entryFor(projectRoot, file) {
  const text = readFileSync(file, 'utf8');
  const path = posix(relative(projectRoot, file));
  try { return { path, declaration: JSON.parse(text) }; } catch { return { path, text }; }
}

const isDir = (p) => { try { return statSync(p).isDirectory(); } catch { return false; } };

// Keyed `<pack>/<task>` and `<pack>`, a local pack spelled `local/<name>` as the
// declaration spells it, and sorted, so the file's bytes are a function of the
// declaration and the pack contents alone.
export function flatDeclarations(projectRoot, active) {
  const corpusRoot = corpusRootFor(projectRoot);
  const tasks = {};
  const dashboards = {};
  for (const pack of active) {
    if (pack.temp) continue;
    const dir = packDirIn(pack, corpusRoot);
    const id = pack.local ? `local/${pack.id}` : pack.id;
    const tasksDir = join(dir, 'tasks');
    if (isDir(tasksDir)) {
      for (const name of readdirSync(tasksDir).sort()) {
        const file = join(tasksDir, name, 'task.json');
        if (existsSync(file)) tasks[`${id}/${name}`] = entryFor(projectRoot, file);
      }
    }
    const descriptor = join(dir, DESCRIPTOR_FILE);
    if (existsSync(descriptor)) dashboards[id] = entryFor(projectRoot, descriptor);
  }
  const sorted = (o) => Object.fromEntries(Object.keys(o).sort().map((k) => [k, o[k]]));
  return { tasks: sorted(tasks), dashboards: sorted(dashboards) };
}

const render = (key, entries) => `${JSON.stringify({ version: FLAT_VERSION, [key]: entries }, null, 2)}\n`;

async function activePacks(projectRoot) {
  const packs = await loadPacks({ localRoot: projectRoot });
  return packs.filter((pack) => isActive(pack, { packs: declaredPacks(projectRoot) }));
}

// The two files' text, or null when nothing could be loaded - a broken loader or an
// unvendored mount leaves whatever is on disk rather than blanking it.
export async function flatDeclarationsContent(projectRoot) {
  try {
    const active = await activePacks(projectRoot);
    if (!active.length) return null;
    const { tasks, dashboards } = flatDeclarations(projectRoot, active);
    return { [FLAT_TASKS_FILE]: render('tasks', tasks), [FLAT_DASHBOARD_FILE]: render('dashboards', dashboards) };
  } catch {
    return null; // fail soft - a broken loader must never block a converge
  }
}

// Write whichever of the two changed; returns the paths written.
export async function writeFlatDeclarations(projectRoot) {
  const content = await flatDeclarationsContent(projectRoot);
  if (!content) return [];
  const written = [];
  for (const [file, text] of Object.entries(content)) {
    const path = join(projectRoot, file);
    if (existsSync(path) && readFileSync(path, 'utf8') === text) continue;
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, text);
    written.push(file);
  }
  return written;
}

// CLI: `node generate-flat-declarations.mjs [--write] [root]` - print both, or write them.
async function main() {
  const argv = process.argv.slice(2);
  const root = argv.find((a) => !a.startsWith('--')) || process.env.CLAUDE_PROJECT_DIR || process.cwd();
  if (argv.includes('--write')) {
    const written = await writeFlatDeclarations(root);
    console.log(written.length ? `wrote ${written.join(', ')}` : 'flat declarations already current');
    return;
  }
  const content = await flatDeclarationsContent(root);
  if (content) process.stdout.write(Object.values(content).join(''));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(e); process.exitCode = 1; });
}
