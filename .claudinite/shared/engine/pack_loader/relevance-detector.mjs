// A pack's fingerprint as data: which tracked paths suggest the pack, and optionally
// what one of those files must contain. Because it is data rather than a function,
// every reader evaluates the same spec its own way: a session over its checkout, the
// fleet sweep over a member's tree listing, a dashboard in a browser over GitHub's API,
// which can narrow the text half with a code search for the `search` terms before
// reading anything. A relevance detector only suspects a pack is wanted; declaring it is the
// project's call.
//
//   about   what a person reads: the thing found, in words
//   paths   a RegExp tested against each tracked path
//   text    optional RegExp, or list of them, every one matching the same file
//
// A manifest written as JSON spells each pattern as its source string, or as
// `{ source, flags }` where it needs a flag; `relevanceDetectorFromData` rebuilds them.
//   search  code-search terms, required with `text`: a file `text` matches contains
//           at least one of them, so a search for any of them finds every candidate
//
// No filesystem and no imports, so a browser can load it as it is.

// GitHub's code search refuses a query with more than five AND/OR/NOT operators, and
// the terms are joined with OR into one query.
export const MAX_SEARCH_TERMS = 6;

const KEYS = new Set(['about', 'paths', 'text', 'search']);
const isPattern = (v) => v instanceof RegExp;
const patterns = (text) => (text === undefined ? [] : [].concat(text));

// A `g` or `y` pattern keeps state between `.test` calls, so the second file tested
// could fail on what the first left behind.
const stateless = (r) => !/[gy]/.test(r.flags);

export function validateRelevanceDetector(relevanceDetector) {
  if (relevanceDetector === null) return [];
  if (typeof relevanceDetector !== 'object' || Array.isArray(relevanceDetector)) return ['relevanceDetector is an object or null'];
  const errors = [];
  for (const key of Object.keys(relevanceDetector)) if (!KEYS.has(key)) errors.push(`relevanceDetector declares "${key}", which is not one of ${[...KEYS].join(', ')}`);
  if (typeof relevanceDetector.about !== 'string' || !relevanceDetector.about.trim()) errors.push('relevanceDetector.about names what is found, in words');
  if (!isPattern(relevanceDetector.paths)) errors.push('relevanceDetector.paths is a RegExp over tracked paths');
  const text = patterns(relevanceDetector.text);
  if (!text.every(isPattern)) errors.push('relevanceDetector.text is a RegExp or a list of them');
  const all = [relevanceDetector.paths, ...text].filter(isPattern);
  if (!all.every(stateless)) errors.push('a relevanceDetector pattern carries the g or y flag, which makes .test stateful');
  if (text.length && !(Array.isArray(relevanceDetector.search) && relevanceDetector.search.length && relevanceDetector.search.every((s) => typeof s === 'string' && s.trim()))) {
    errors.push('relevanceDetector.search lists the code-search terms that find every file relevanceDetector.text matches');
  }
  if (Array.isArray(relevanceDetector.search) && relevanceDetector.search.length > MAX_SEARCH_TERMS) {
    errors.push(`relevanceDetector.search names ${relevanceDetector.search.length} terms; one code search joins at most six`);
  }
  return errors;
}

export const detectorCandidates = (relevanceDetector, tracked) => tracked.filter((f) => relevanceDetector.paths.test(f));

export function detectsRelevance(relevanceDetector, ctx) {
  if (!relevanceDetector) return false;
  const text = patterns(relevanceDetector.text);
  return ctx.tracked.some((f) => {
    if (!relevanceDetector.paths.test(f)) return false;
    if (!text.length) return true;
    const body = ctx.read(f);
    return body !== null && text.every((r) => r.test(body));
  });
}

const patternData = (r) => ({ source: r.source, flags: r.flags });

// The spec with every pattern as { source, flags }: what a reader outside this
// runtime, or across a JSON boundary, rebuilds with `new RegExp(source, flags)`.
export function relevanceDetectorData(relevanceDetector) {
  if (!relevanceDetector) return null;
  return {
    about: relevanceDetector.about,
    paths: patternData(relevanceDetector.paths),
    ...(relevanceDetector.text !== undefined ? { text: patterns(relevanceDetector.text).map(patternData) } : {}),
    ...(relevanceDetector.search ? { search: [...relevanceDetector.search] } : {}),
  };
}

// The inverse, and the looser one: a pattern may arrive as a RegExp, a source string
// or `{ source, flags }`, and leaves as a RegExp. Anything else passes through for
// `validateRelevanceDetector` to name; a source that does not compile throws.
const patternFrom = (v) => {
  if (typeof v === 'string') return new RegExp(v);
  if (v !== null && typeof v === 'object' && !(v instanceof RegExp) && typeof v.source === 'string') return new RegExp(v.source, v.flags ?? '');
  return v;
};

export function relevanceDetectorFromData(relevanceDetector) {
  if (relevanceDetector === null || typeof relevanceDetector !== 'object' || Array.isArray(relevanceDetector)) return relevanceDetector;
  const { paths, text } = relevanceDetector;
  return {
    ...relevanceDetector,
    ...(paths !== undefined ? { paths: patternFrom(paths) } : {}),
    ...(text !== undefined ? { text: Array.isArray(text) ? text.map(patternFrom) : patternFrom(text) } : {}),
  };
}
