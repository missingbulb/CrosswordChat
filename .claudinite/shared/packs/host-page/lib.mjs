// Shared plumbing for this pack's checks. The two general helpers every check
// needs — `finding` and `stripComments` — come from the engine's own helpers;
// what stays here is the part specific to reading host-page call sites.

// comment that merely names `dispatchEvent` or `MutationObserver` describes the
// trap, it doesn't spring it — and this pack's own prose would otherwise fire its
// own checks. Newlines are preserved so line numbers survive the strip.
// What counts as shipped browser source. Deliberately NOT a hard-coded project
// root: every rule in this pack is gated on the DOM API it judges actually
// appearing in the file, so the trigger is the API usage itself and the scan can
// safely be repo-shaped. A path scope hard-wired to one project's layout would
// make every rule match zero files — and pass VACUOUSLY GREEN — in any repo laid
// out differently, which is the worst failure mode a check has.
//
// The one thing the scan must still exclude is test scaffolding: a test that
// dispatches a bare event at its own jsdom node, or spins an observer it lets the
// test runner collect, is doing something purpose-built and is not adapting to a
// host page. That exclusion is expressed directly — by test/vendor path and test
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

/**
 * The UI event interfaces that model **real user input**. These are the ones a
 * host page's own handlers are written against, so a synthetic one is only a
 * faithful stand-in for a user if it looks like what the browser would have
 * produced. `CustomEvent` is deliberately absent: it is your own signal to your
 * own listener and has no fidelity contract to hold it to.
 */
export const INPUT_EVENT_CLASSES = [
  'KeyboardEvent',
  'MouseEvent',
  'PointerEvent',
  'TouchEvent',
  'WheelEvent',
  'InputEvent',
  'DragEvent',
  'CompositionEvent',
];

const INPUT_EVENT_RE = new RegExp(`\\b(?:${INPUT_EVENT_CLASSES.join('|')})\\b`);

/**
 * The constructor names in `src` that stand for a real-input event — the classes
 * themselves, plus the ONE hop real code actually takes: a local alias assigned
 * from them. Picking the constructor by feature (`const Ctor = key ? view.KeyboardEvent
 * : view.MouseEvent`) is how a generic `fire()` helper is written, and a matcher
 * that only knew the literal class names would look straight past the single
 * dispatch site a whole adapter funnels its input through.
 */
export function inputEventCtors(src) {
  const names = new Set(INPUT_EVENT_CLASSES);
  const ALIAS = /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*([^;\n]*)/g;
  let m;
  while ((m = ALIAS.exec(src))) {
    if (INPUT_EVENT_RE.test(m[2])) names.add(m[1]);
  }
  return names;
}

/**
 * Every `new <ctor>(…)` construction in `src` whose constructor is one of `names`
 * (an optional `view.` / `window.` / `globalThis.` receiver is allowed — a content
 * script constructing an event for another frame's document must use THAT window's
 * constructor). Returns `{ name, index, args, init }`, where `init` is the second
 * argument's object literal, or null when the call passes no init literal at all.
 */
export function eventConstructions(src, names) {
  const NEW = /\bnew\s+(?:(?:window|globalThis|self|view|win)\s*\.\s*)?([A-Za-z_$][\w$]*)\s*\(/g;
  const out = [];
  let m;
  while ((m = NEW.exec(src))) {
    if (!names.has(m[1])) continue;
    const args = balanced(src, NEW.lastIndex - 1);
    if (args === null) continue; // unbalanced source: say nothing
    const brace = args.indexOf('{');
    const init = brace === -1 ? null : balanced(args, brace);
    out.push({ name: m[1], index: m.index, args, init });
  }
  return out;
}

/** Does an init object literal spread something this check cannot see into? */
export const hasSpread = (init) => init !== null && init.includes('...');
