// Shared plumbing for this pack's checks.
//
// Deliberately dependency-free, and deliberately NOT importing the sibling
// browser-speech / host-page-adaptation packs' copies of the same helpers: a pack
// composes by declaration, never by importing another pack's code (pack
// independence), and a local pack's check modules must load even when the
// gitignored canon mount is absent — the project's own vitest run is exactly that
// situation.

/** The plain finding object the checks runner consumes (engine/checks/README.md). */
export function finding(rule, { file, line = null, what, fix, why = null, severity = null }) {
  return {
    rule: rule.id,
    severity: severity || rule.severity,
    file,
    line,
    what,
    why: why || rule.why,
    fix,
    doc: rule.doc,
  };
}

// String-aware comment stripper. The rule here matches against source *code*: a
// comment that lists the phrases an intent also accepts describes the table, it
// doesn't build it — and a commented-out arm of a lexicon is not a live arm.
// Newlines are preserved so line numbers survive the strip.
export function stripComments(source) {
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

// What counts as shipped source. Deliberately NOT a hard-coded project root: the
// rule is gated on the lexicon shape actually appearing in the file, so the shape
// itself is the trigger and the scan can safely be repo-shaped. A path scope
// hard-wired to one project's layout would make the rule match zero files — and
// pass VACUOUSLY GREEN — in any repo laid out differently, which is the worst
// failure mode a check has.
//
// The exclusion that matters is test scaffolding and fixtures: a test that builds
// a two-arm lexicon to exercise one branch is not shipping a command grammar, and
// a fixture deliberately carrying the violation is the point of the fixture.
const SOURCE_EXT = /\.(?:m|c)?[jt]sx?$/;
const NOT_SOURCE = [
  /(?:^|\/)(?:node_modules|dist|build|out|coverage|vendor|third_party)\//,
  /(?:^|\/)(?:tests?|__tests__|__mocks__|spec|fixtures?|mocks?|e2e)\//,
  /(?:^|[./-])(?:test|spec|fixture|mock|stub|fake)s?\.[^/]+$/,
];
export const isSource = (file) => SOURCE_EXT.test(file) && !NOT_SOURCE.some((re) => re.test(file));

/** 1-based line number of `index` in `text`. */
export const lineOf = (text, index) => text.slice(0, index).split('\n').length;

/**
 * The balanced bracketed run beginning at the opener at `open` (inclusive of both
 * brackets), or null when the source is unbalanced — a half-written file should
 * make a check say nothing, never guess. String and template literals are skipped
 * so a bracket inside "a(b)" can't be read as syntax.
 */
export function balanced(src, open) {
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    const c = src[i];
    if (c === '"' || c === "'" || c === '`') {
      const quote = c;
      for (i += 1; i < src.length; i++) {
        if (src[i] === '\\') { i += 1; continue; }
        if (src[i] === quote) break;
      }
      continue;
    }
    if (c === '{' || c === '[' || c === '(') depth += 1;
    else if (c === '}' || c === ']' || c === ')') {
      depth -= 1;
      if (depth === 0) return src.slice(open, i + 1);
    }
  }
  return null;
}

const STRING_LITERAL = /'([^'\\]*)'|"([^"\\]*)"/g;

/**
 * Every `const|let|var NAME = { … }` object literal in `src` whose properties map
 * a key to an ARRAY OF STRING LITERALS — the shape a phrase table takes. Returns
 * `{ name, index, body, arms }`, `arms` being `[{ key, phrases: [{ text, index }] }]`
 * with indices relative to `src`.
 *
 * An arm whose array holds anything other than string literals (a nested array, an
 * identifier, a computed value) is skipped rather than guessed at, and a table with
 * fewer than two such arms is not a lexicon at all — one arm cannot collide.
 */
export function phraseTables(src) {
  const DECL = /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*\{/g;
  const out = [];
  let m;
  while ((m = DECL.exec(src))) {
    const bodyStart = DECL.lastIndex - 1;
    const body = balanced(src, bodyStart);
    if (body === null) continue; // unbalanced source: say nothing
    const PROP = /(?:^|[,{])\s*(?:'([^']*)'|"([^"]*)"|([A-Za-z_$][\w$]*)|(\d+))\s*:\s*\[/g;
    const arms = [];
    let p;
    while ((p = PROP.exec(body))) {
      const key = p[1] ?? p[2] ?? p[3] ?? p[4];
      const arrStart = PROP.lastIndex - 1;
      const arr = balanced(body, arrStart);
      if (arr === null) continue;
      // Only an array that is *nothing but* string literals is a phrase list.
      const residue = arr.replace(STRING_LITERAL, '').replace(/[[\],\s]/g, '');
      if (residue.length) continue;
      const phrases = [];
      STRING_LITERAL.lastIndex = 0;
      let s;
      while ((s = STRING_LITERAL.exec(arr))) {
        phrases.push({ text: s[1] ?? s[2], index: bodyStart + arrStart + s.index });
      }
      if (phrases.length) arms.push({ key, phrases });
    }
    if (arms.length >= 2) out.push({ name: m[1], index: m.index, body, arms });
  }
  return out;
}

// How a phrase table is consumed when a duplicate phrase can silently disappear:
// the table is walked arm by arm and each phrase is either INVERTED into a lookup
// keyed by the phrase (`EXACT.set(p, …)`, `byPhrase[p] = key`) or MATCHED against
// the utterance in table order (`phrases.includes(norm)`). Both resolve a phrase
// listed twice by position alone — last writer wins, or first arm wins — with
// nothing anywhere saying which was meant.
const WALKS = (name) => new RegExp(
  `Object\\s*\\.\\s*(?:entries|keys)\\s*\\(\\s*${name}\\s*\\)|\\bin\\s+${name}\\b`,
  'g',
);
const RESOLVES = /\.\s*(?:set|includes|has|indexOf)\s*\(|\[\s*[A-Za-z_$][\w$]*\s*\]\s*=[^=]/;

/**
 * Is `table` walked in `src` as a phrase→intent lexicon — i.e. does a walk over it
 * feed a phrase-keyed lookup or an in-order match? A table nobody walks is data
 * somebody reads by key, and a repeated string in it is not an ambiguity.
 */
export function isWalkedAsLexicon(src, table) {
  const walks = WALKS(table.name);
  let m;
  while ((m = walks.exec(src))) {
    if (RESOLVES.test(src.slice(m.index, m.index + 400))) return true;
  }
  return false;
}
