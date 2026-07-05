#!/usr/bin/env node
// Requirements traceability (REQ-NFR-006; schema in docs/REQUIREMENTS.md §14).
//
// Fails when:
//   • an Active requirement has no coverage (no automated test and no manual test mentions it)
//   • any test / manual item mentions a requirement ID that the requirements doc doesn't define
//   • a requirement heading lacks a Status line
// Prints the full coverage matrix either way.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const REQ_DOC = join(ROOT, 'docs/REQUIREMENTS.md');
const MANUAL_DOC = join(ROOT, 'docs/MANUAL-TESTS.md');
const TESTS_DIR = join(ROOT, 'tests');
const ID_RE = /REQ-[A-Z]+-\d{3}/g;
const IGNORED_AREAS = new Set(['FAKE']); // reserved for MT-22's tamper drill

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (name.endsWith('.test.js')) out.push(p);
  }
  return out;
}

const area = (id) => id.split('-')[1];

// ---- 1. Definitions from REQUIREMENTS.md -----------------------------------
const reqText = readFileSync(REQ_DOC, 'utf8');
const lines = reqText.split('\n');
const defined = new Map(); // id → {status}
const malformed = [];

for (let i = 0; i < lines.length; i++) {
  const heading = lines[i].match(/^#{3,4}\s+(REQ-[A-Z]+-\d{3})\b/);
  if (heading) {
    const id = heading[1];
    let status = null;
    for (let j = i + 1; j < Math.min(i + 6, lines.length); j++) {
      const m = lines[j].match(/\*\*Status:\*\*\s*(Active|Planned|Retired)/);
      if (m) {
        status = m[1];
        break;
      }
    }
    if (!status) malformed.push(id);
    defined.set(id, { status: status ?? 'Active' });
    continue;
  }
  // Future-work bullets: "**REQ-FUT-001 — ...**" are Planned by construction.
  const bullet = lines[i].match(/\*\*(REQ-[A-Z]+-\d{3}) —/);
  if (bullet && !defined.has(bullet[1])) defined.set(bullet[1], { status: 'Planned' });
}

// ---- 2. Coverage mentions ----------------------------------------------------
const coverage = new Map(); // id → Set(where)
const unknownMentions = []; // {id, where}

function recordMentions(text, where) {
  for (const id of text.match(ID_RE) ?? []) {
    if (IGNORED_AREAS.has(area(id))) continue;
    if (!defined.has(id)) {
      unknownMentions.push({ id, where });
      continue;
    }
    if (!coverage.has(id)) coverage.set(id, new Set());
    coverage.get(id).add(where);
  }
}

for (const file of walk(TESTS_DIR)) {
  recordMentions(readFileSync(file, 'utf8'), relative(ROOT, file));
}
const manualText = readFileSync(MANUAL_DOC, 'utf8');
let currentMt = null;
for (const line of manualText.split('\n')) {
  const mt = line.match(/^###\s+(MT-\d+)/);
  if (mt) currentMt = mt[1];
  if (/^Covers:/.test(line)) recordMentions(line, `docs/MANUAL-TESTS.md ${currentMt ?? ''}`.trim());
}

// ---- 3. Report ---------------------------------------------------------------
const active = [...defined.entries()].filter(([, d]) => d.status === 'Active').map(([id]) => id);
const planned = [...defined.entries()].filter(([, d]) => d.status === 'Planned').map(([id]) => id);
const uncovered = active.filter((id) => !coverage.has(id));

const byArea = new Map();
for (const id of [...defined.keys()].sort()) {
  const a = area(id);
  if (!byArea.has(a)) byArea.set(a, []);
  byArea.get(a).push(id);
}

console.log('Requirements coverage matrix');
console.log('============================');
for (const [a, ids] of byArea) {
  console.log(`\n${a}`);
  for (const id of ids) {
    const { status } = defined.get(id);
    const refs = [...(coverage.get(id) ?? [])];
    const mark = status !== 'Active' ? '◌' : refs.length ? '✅' : '❌';
    const detail = status !== 'Active'
      ? `${status} (not enforced)`
      : refs.length ? refs.join(', ') : 'NO COVERAGE';
    console.log(`  ${mark} ${id}  ${detail}`);
  }
}

console.log(`\nActive: ${active.length}  Planned: ${planned.length}  Covered: ${active.length - uncovered.length}/${active.length}`);

let failed = false;
if (malformed.length) {
  failed = true;
  console.error(`\n✗ Requirement heading(s) missing a **Status:** line: ${malformed.join(', ')}`);
}
if (uncovered.length) {
  failed = true;
  console.error(`\n✗ Active requirement(s) without any test coverage:\n  ${uncovered.join('\n  ')}`);
}
if (unknownMentions.length) {
  failed = true;
  console.error('\n✗ Mention(s) of requirement IDs not defined in docs/REQUIREMENTS.md:');
  for (const { id, where } of unknownMentions) console.error(`  ${id} in ${where}`);
}

if (failed) process.exit(1);
console.log('\n✓ Every Active requirement is covered; no phantom IDs.');
