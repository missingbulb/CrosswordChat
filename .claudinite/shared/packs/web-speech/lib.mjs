// Shared plumbing for this pack's speech-API checks. The two general helpers
// every check needs — `finding` and `stripComments` — come from the engine's own
// helpers; what stays here is the part specific to reading speech-API call sites.

// What counts as shipped browser source. Deliberately NOT a path root: every
// rule in this pack is gated on the speech API it judges actually appearing in
// the file, so the trigger is the API usage itself and the scan can be repo-shape
// agnostic. A path scope hard-wired to one project's layout would make every rule
// match zero files — and pass VACUOUSLY GREEN — in a repo laid out differently,
// which is the worst failure mode a check has.
//
// The one thing the scan must still exclude is test scaffolding: hand-rolled
// speech fakes implement only the halves of a contract a given case exercises,
// and holding purpose-built scaffolding to the production contract is a false
// alarm. That exclusion is expressed directly — by test/vendor path and test
// filename — rather than as a side effect of a source root.
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
