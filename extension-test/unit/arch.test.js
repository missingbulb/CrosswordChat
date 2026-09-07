// Architecture rules, enforced mechanically (see dev/docs/ARCHITECTURE.md §2).

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

// These rules match forbidden tokens against source *code*, not prose: a comment
// that merely names `chrome.storage` or `xwd__` describes the code, it doesn't do
// it, so matching it is a false positive. Read every file with its comments stripped.
// String-aware inline of Claudinite's checks/lib/source.mjs `stripComments` (the
// canonical helper) — the mount isn't present in CI, so this scan can't import it.
function stripComments(source) {
  let out = '';
  let state = 'code'; // code | line | block | sq | dq | tpl
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    const c2 = source[i + 1];
    if (state === 'code') {
      if (c === '/' && c2 === '/') { state = 'line'; i++; continue; }
      if (c === '/' && c2 === '*') { state = 'block'; i++; continue; }
      if (c === "'") state = 'sq';
      else if (c === '"') state = 'dq';
      else if (c === '`') state = 'tpl';
      out += c;
    } else if (state === 'line') {
      if (c === '\n') { state = 'code'; out += c; }
    } else if (state === 'block') {
      if (c === '*' && c2 === '/') { state = 'code'; i++; }
      else if (c === '\n') out += c;
    } else {
      out += c;
      if (c === '\\') { out += c2 ?? ''; i++; }
      else if ((state === 'sq' && c === "'") || (state === 'dq' && c === '"') || (state === 'tpl' && c === '`')) {
        state = 'code';
      }
    }
  }
  return out;
}

const readCode = (p) => stripComments(readFileSync(p, 'utf8'));

// A port's contract is the method set on the object its factory's "return {" literal
// exposes. Read only the keys at that literal's own indent depth (4 spaces, one level
// inside the factory), so a same-named helper nested inside a method body — itself
// indented deeper — is never mistaken for a contract entry.
function portContractMethods(path) {
  const source = readCode(path);
  const start = source.indexOf('return {');
  if (start === -1) throw new Error(`${rel(path)}: no "return {" factory result found`);
  const end = source.indexOf('\n  };', start);
  if (end === -1) throw new Error(`${rel(path)}: "return {" literal never closes with "  };"`);
  const block = source.slice(start, end);
  const names = new Set();
  for (const m of block.matchAll(/^ {4}(?:async\s+)?([a-zA-Z_$][\w$]*)\s*\(/gm)) names.add(m[1]);
  return names;
}

describe('architecture rules', () => {
  test('REQ-PAGE-011: NYT DOM specifics (xwd__) live only in page-adapter', () => {
    const offenders = sourceFiles()
      .filter((p) => !rel(p).startsWith('extension/src/page-adapter/'))
      .filter((p) => readCode(p).includes('xwd__'))
      .map(rel);
    expect(offenders).toEqual([]);
  });

  test('REQ-NFR-001: no network primitives anywhere in extension source', () => {
    const NETWORK = /\bfetch\s*\(|XMLHttpRequest|new\s+WebSocket|EventSource\s*\(/;
    const offenders = sourceFiles()
      .filter((p) => NETWORK.test(readCode(p)))
      .map(rel);
    expect(offenders).toEqual([]);
  });

  test('REQ-NFR-002: persistence primitives only in the settings module and options page', () => {
    // REQ-DIAG-001: the in-memory session log and its "Send session data" export add no
    // storage or network primitive — this scan (and REQ-NFR-001's above) is exactly what
    // keeps the transcript in memory only and never sent by the extension.
    const STORAGE = /localStorage|sessionStorage|indexedDB|chrome\.storage/;
    const ALLOWED = ['extension/src/settings/', 'extension/src/options/'];
    const offenders = sourceFiles()
      .filter((p) => !ALLOWED.some((dir) => rel(p).startsWith(dir)))
      .filter((p) => STORAGE.test(readCode(p)))
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
      const text = readCode(p);
      for (const re of IMPURE_HINTS) {
        if (re.test(text)) offenders.push(`${r} matches ${re}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  test('speech/remote-tts-port.js presents the same contract as speech/tts-port.js', () => {
    const direct = join(SRC, 'speech/tts-port.js');
    const relayed = join(SRC, 'speech/remote-tts-port.js');
    const directMethods = portContractMethods(direct);
    const relayedMethods = portContractMethods(relayed);
    const missingFromRelay = [...directMethods].filter((m) => !relayedMethods.has(m));
    const extraOnRelay = [...relayedMethods].filter((m) => !directMethods.has(m));
    expect({ missingFromRelay, extraOnRelay }).toEqual({ missingFromRelay: [], extraOnRelay: [] });
  });
});
