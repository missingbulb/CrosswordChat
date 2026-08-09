// Red-first fixtures for the voice-dialog pack's check.
//
// The rule is exercised four ways: it must FIRE on violating sources, stay QUIET
// on clean ones, stay quiet on the shapes its parsing exists to spare (which are
// then confirmed to fire against the naive alternative), and stay quiet on the
// repo's real extension/src/ tree. That last case is what makes the pack
// shippable — a check that only ever saw its own fixtures is a check nobody has
// confronted with real code.
//
// Runs in the project's own vitest (see the .claudinite/local/packs include in
// vitest.config.js) and imports nothing from the gitignored canon mount, so it
// works in CI exactly as it does locally.

import { describe, test, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

import pack from './pack.mjs';
import { isSource, stripComments, phraseTables } from './lib.mjs';
import intentPhrasesUnique from './intent-phrases-unique.mjs';

// A check context over a literal file map — the same {files, read} surface the
// engine's runner passes, with nothing else the rule is allowed to touch.
const ctxOf = (files) => ({
  files: Object.keys(files),
  read: (f) => (f in files ? files[f] : null),
});

const run = (rule, files) => rule.run(ctxOf(files));

describe('voice-dialog pack manifest', () => {
  test('is a hand-declared local pack whose rules are all wired', () => {
    expect(pack.id).toBe('voice-dialog'); // must equal the directory name
    expect(pack.detect).toBeNull();
    expect(pack.marker).toBeNull();
    expect(pack.prose).toBe('RULES.md');
    expect(pack.worldRules.map((r) => r.id).sort()).toEqual(['intent-phrases-unique']);
  });
});

// The scan must be repo-shape agnostic: a rule that only ever looks under one
// project's source root matches nothing — and passes vacuously green — in a repo
// laid out differently, which is exactly the bug these cases exist to prevent.
describe('source scope', () => {
  test('accepts source under any layout, in JS and TS alike', () => {
    for (const file of [
      'extension/src/matching/commands.js',
      'src/dialog/intents.ts',
      'app/lib/lexicon.tsx',
      'packages/voice/grammar.mjs',
      'assistant.cjs',
    ]) expect(isSource(file), file).toBe(true);
  });

  test('rejects test scaffolding, fixtures and vendored code wherever they sit', () => {
    for (const file of [
      'extension-test/unit/matching.test.js',
      'extension-test/fixtures/fake-nyt/fake-app.js',
      'src/lexicon.spec.ts',
      'test/intents.js',
      'node_modules/x/index.js',
      'dist/content.js',
      'README.md',
    ]) expect(isSource(file), file).toBe(false);
  });
});

// The two shapes in which a duplicated phrase silently disappears: inverted into a
// phrase-keyed lookup (last writer wins) and matched arm by arm (first arm wins).
const INVERTED_DUP = `
  const PHRASES = {
    next: ['next', 'skip', 'pass'],
    clear: ['clear', 'erase', 'delete'],
    undo: ['undo', 'undue', 'delete'],
  };
  const EXACT = new Map();
  for (const [intent, phrases] of Object.entries(PHRASES)) {
    for (const p of phrases) EXACT.set(p, { intent });
  }
  export const parse = (text) => EXACT.get(text) ?? null;
`;

const SCANNED_DUP = `
  const CONTROLS = {
    done: ['done', 'finished', 'enter'],
    cancel: ['cancel', 'never mind', 'enter'],
  };
  export function control(norm) {
    for (const [control, phrases] of Object.entries(CONTROLS)) {
      if (phrases.includes(norm)) return control;
    }
    return null;
  }
`;

// Quiet: the same phrase repeated INSIDE one arm resolves to the intent it was
// always going to resolve to. Redundant, not ambiguous.
const REPEAT_WITHIN_ARM = `
  const PHRASES = {
    next: ['next', 'skip', 'next'],
    clear: ['clear', 'erase'],
  };
  const EXACT = new Map();
  for (const [intent, phrases] of Object.entries(PHRASES)) {
    for (const p of phrases) EXACT.set(p, { intent });
  }
`;

// Quiet: a table nobody walks as a lexicon. A synonym/expansion map read BY KEY
// legitimately names the same word under several keys — a homophone set is the
// canonical case — and firing here is precisely the false alarm that teaches a
// team to ignore a check.
const SYNONYM_MAP_READ_BY_KEY = `
  const HOMOPHONES = {
    SEA: ['SEE', 'C'],
    SEE: ['SEA', 'C'],
    C: ['SEA', 'SEE'],
  };
  export const homophonesOf = (word) => HOMOPHONES[word] ?? [];
`;

describe('intent-phrases-unique', () => {
  test('fires on a phrase listed under two intents in an inverted lexicon', () => {
    const found = run(intentPhrasesUnique, { 'src/commands.js': INVERTED_DUP });
    expect(found.map((f) => f.rule)).toEqual(['intent-phrases-unique']);
    expect(found[0].what).toContain('"delete"');
    expect(found[0].what).toContain('clear');
    expect(found[0].what).toContain('undo');
    expect(found[0].severity).toBe('blocking');
    expect(found[0].line).toBe(5); // the losing arm's copy, not the first one
  });

  test('fires on a phrase listed under two intents in an arm-by-arm match', () => {
    const found = run(intentPhrasesUnique, { 'src/spelling.ts': SCANNED_DUP });
    expect(found.map((f) => f.rule)).toEqual(['intent-phrases-unique']);
    expect(found[0].what).toContain('"enter"');
  });

  test('is quiet on a lexicon whose phrases are all distinct', () => {
    const clean = INVERTED_DUP.replace("'undo', 'undue', 'delete'", "'undo', 'undue'");
    expect(run(intentPhrasesUnique, { 'src/commands.js': clean })).toEqual([]);
  });

  test('is quiet on a phrase repeated inside one arm', () => {
    expect(run(intentPhrasesUnique, { 'src/commands.js': REPEAT_WITHIN_ARM })).toEqual([]);
  });

  test('is quiet on a synonym map read by key rather than walked as a lexicon', () => {
    expect(run(intentPhrasesUnique, { 'src/homophones.js': SYNONYM_MAP_READ_BY_KEY })).toEqual([]);
  });

  test('is quiet on a commented-out arm', () => {
    const commented = `
      const PHRASES = {
        next: ['next', 'skip'],
        // clear: ['clear', 'skip'],
        clear: ['clear', 'erase'],
      };
      const EXACT = new Map();
      for (const [intent, phrases] of Object.entries(PHRASES)) {
        for (const p of phrases) EXACT.set(p, { intent });
      }
    `;
    expect(run(intentPhrasesUnique, { 'src/commands.js': commented })).toEqual([]);
  });

  test('skips test scaffolding and vendored code', () => {
    expect(run(intentPhrasesUnique, {
      'src/__tests__/commands.test.js': INVERTED_DUP,
      'node_modules/voicelib/index.js': INVERTED_DUP,
    })).toEqual([]);
  });
});

// A violating fixture failing and a clean one passing only proves the shipped
// check is correct — it says nothing about whether the parsing it does was
// NECESSARY. So run the quiet fixtures against the naive alternative the parsing
// exists to avoid, and confirm they would wrongly fire there.
describe('the parsing earns its complexity', () => {
  // The naive check: any object-of-string-arrays with a string appearing twice
  // anywhere in it — no per-arm scoping, no "is this walked as a lexicon?" gate.
  const naiveFires = (source) => {
    const src = stripComments(source);
    for (const table of phraseTables(src)) {
      const seen = new Set();
      for (const arm of table.arms) {
        for (const phrase of arm.phrases) {
          if (seen.has(phrase.text)) return true;
          seen.add(phrase.text);
        }
      }
    }
    return false;
  };

  test('the naive alternative wrongly fires on the quiet fixtures', () => {
    expect(naiveFires(REPEAT_WITHIN_ARM)).toBe(true);
    expect(naiveFires(SYNONYM_MAP_READ_BY_KEY)).toBe(true);
  });

  test('and the real rule still catches both violations', () => {
    expect(naiveFires(INVERTED_DUP)).toBe(true);
    expect(naiveFires(SCANNED_DUP)).toBe(true);
  });
});

// The corpus the rule was discovered against. It must stay quiet here — and this
// repo really does ship the shapes the rule judges (three walked phrase tables in
// two files), so the silence is evidence the rule reaches real code rather than
// passing over it.
describe("this repo's own extension source", () => {
  const ROOT = process.cwd();
  const sourceFiles = (dir, out = []) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) sourceFiles(p, out);
      else out.push(relative(ROOT, p).split(sep).join('/'));
    }
    return out;
  };
  const files = Object.fromEntries(
    sourceFiles(join(ROOT, 'extension/src')).map((f) => [f, readFileSync(join(ROOT, f), 'utf8')]),
  );

  test('really does contain walked phrase lexicons for the rule to judge', () => {
    const walked = Object.entries(files)
      .filter(([f]) => isSource(f))
      .flatMap(([, src]) => phraseTables(stripComments(src)).map((t) => t.name));
    expect(walked).toEqual(expect.arrayContaining(['PHRASES', 'CHOICE_PHRASES', 'CONTROLS']));
  });

  test('is quiet', () => {
    expect(run(intentPhrasesUnique, files)).toEqual([]);
  });
});
