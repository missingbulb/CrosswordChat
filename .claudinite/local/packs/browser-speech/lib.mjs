// Shared plumbing for this pack's checks.
//
// Deliberately dependency-free: a local pack's check modules must load even when
// the gitignored canon mount is absent (the project's own vitest run is exactly
// that situation), so nothing here imports `engine/checks/helpers/*`. The two
// things every rule needs are a finding constructor and a comment stripper.

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

// String-aware comment stripper. Every rule below matches against source *code*:
// a comment that merely names `chrome.tts.speak` or `getUserMedia` describes the
// trap, it doesn't spring it — and this pack's own prose would otherwise fire its
// own checks. Same technique the repo's arch test already uses
// (extension-test/unit/arch.test.js), kept here so the pack stands alone.
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

// The extension's shipped source. Every rule here is about how *this* product
// drives the browser's speech APIs, so the scan is scoped to the code that runs
// in the browser: the test suite's hand-rolled fakes deliberately implement only
// the halves of these contracts a given case exercises, and holding a fake to the
// production contract would be a false alarm on purpose-built scaffolding.
export const SOURCE_ROOT = 'extension/src/';
export const isSource = (file) => file.startsWith(SOURCE_ROOT) && /\.(?:mjs|js)$/.test(file);

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
