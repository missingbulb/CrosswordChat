// Architecture rules, enforced mechanically (see docs/ARCHITECTURE.md §2).

import { describe, test, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const SRC = join(process.cwd(), 'extension/src');

function sourceFiles(dir = SRC, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) sourceFiles(p, out);
    else if (/\.(js|mjs)$/.test(name)) out.push(p);
  }
  return out;
}

const rel = (p) => relative(process.cwd(), p).split(sep).join('/');

describe('architecture rules', () => {
  test('REQ-PAGE-011: NYT DOM specifics (xwd__) live only in page-adapter', () => {
    const offenders = sourceFiles()
      .filter((p) => !rel(p).startsWith('extension/src/page-adapter/'))
      .filter((p) => readFileSync(p, 'utf8').includes('xwd__'))
      .map(rel);
    expect(offenders).toEqual([]);
  });

  test('REQ-NFR-001: no network primitives anywhere in extension source', () => {
    const NETWORK = /\bfetch\s*\(|XMLHttpRequest|new\s+WebSocket|EventSource\s*\(/;
    const offenders = sourceFiles()
      .filter((p) => NETWORK.test(readFileSync(p, 'utf8')))
      .map(rel);
    expect(offenders).toEqual([]);
  });

  test('REQ-NFR-002: no persistence primitives (localStorage/indexedDB/chrome.storage)', () => {
    const STORAGE = /localStorage|sessionStorage|indexedDB|chrome\.storage/;
    const offenders = sourceFiles()
      .filter((p) => STORAGE.test(readFileSync(p, 'utf8')))
      .map(rel);
    expect(offenders).toEqual([]);
  });

  test('pure layers do not import impure ones', () => {
    const PURE_DIRS = ['puzzle-model', 'matching', 'conversation'];
    const IMPURE_HINTS = [/from '.*\/page-adapter\//, /from '.*\/speech\//, /\bchrome\./, /\bdocument\./];
    const offenders = [];
    for (const p of sourceFiles()) {
      const r = rel(p);
      if (!PURE_DIRS.some((d) => r.startsWith(`extension/src/${d}/`))) continue;
      const text = readFileSync(p, 'utf8');
      for (const re of IMPURE_HINTS) {
        if (re.test(text)) offenders.push(`${r} matches ${re}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
