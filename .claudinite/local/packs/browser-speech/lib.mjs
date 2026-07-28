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

// What counts as shipped browser source. Deliberately NOT a hard-coded project
// root: every rule in this pack is gated on the speech API it judges actually
// appearing in the file, so the trigger is the API usage itself and the scan can
// safely be repo-shaped. A path scope hard-wired to one project's layout would
// make all three rules match zero files — and pass VACUOUSLY GREEN — in any repo
// laid out differently, which is the worst failure mode a check has.
//
// The one thing the scan must still exclude is test scaffolding: hand-rolled
// speech fakes implement only the halves of a contract a given case exercises,
// and holding purpose-built scaffolding to the production contract is a false
// alarm. That exclusion is expressed directly — by test/vendor path and test
// filename — instead of being a side effect of the source root.
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
 * Both legal ways to wire a speech event, as one matcher: the `onfoo =` property
 * assignment and `addEventListener('foo', …)`. The DOM offers both for every one
 * of these targets and neither is more correct, so a rule that knows only the
 * property form silently passes half the world's code — and false-alarms on a
 * file that mixes the two (`rec.onresult = …` beside
 * `rec.addEventListener('error', …)` reads as "no error handler" to a matcher
 * that only understands `.onerror =`).
 */
export const wires = (src, event) =>
  new RegExp(
    `\\.\\s*on${event}\\s*=|addEventListener\\s*\\(\\s*['"\`]${event}['"\`]`,
  ).test(src);

/** Does `text` contain `name` as a string literal? */
export const quoted = (text, name) => new RegExp(`['"\`]${name}['"\`]`).test(text);

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
