// The per-rule timing record a check runner prints after its report, and the
// reader that parses it back. Renderer and parser in one module because the line
// is a wire format between two lanes that ship separately: a runner writes it into
// the session, and the usage review's fold counts `checkTiming` off it a day later.
// A renderer and a parser that disagree record nothing, silently.
//
//   claudinite-check-timing v1 <scope> total=<ms> <rule>=<ms> <rule>=<ms> …
//
// The slowest rules only, and never the whole catalog: the line rides in every
// session's transcript, where ninety rules at a millisecond each would cost more
// than the measurement is worth. `total` is the whole sweep, so the share the
// named rules account for is readable even though the rest are not named.
export const TIMING_PREFIX = 'claudinite-check-timing';
export const TIMING_VERSION = 'v1';
export const TIMING_RULES = 8;

const RE_LINE = new RegExp(`(?:^|\\s)${TIMING_PREFIX} ${TIMING_VERSION} (\\S+) total=(\\d+)((?: [^\\s=]+=\\d+)*)\\s*$`, 'm');

// `timings` is [{ id, ms }], one entry per rule run - several for a rule the
// runner ran more than once, which are summed here rather than at the call site.
export function renderTiming(scope, totalMs, timings) {
  const byRule = new Map();
  for (const { id, ms } of timings ?? []) byRule.set(id, (byRule.get(id) ?? 0) + ms);
  const slowest = [...byRule.entries()]
    .map(([id, ms]) => [id, Math.round(ms)])
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, TIMING_RULES);
  return [
    `${TIMING_PREFIX} ${TIMING_VERSION} ${scope} total=${Math.round(totalMs)}`,
    ...slowest.map(([id, ms]) => `${id}=${ms}`),
  ].join(' ');
}

// The record a line carries: { scope, totalMs, rules: [{ id, ms }] }, or null
// where the text holds no record - an older engine's report, or any other line.
export function parseTiming(text) {
  const m = RE_LINE.exec(String(text ?? ''));
  if (!m) return null;
  const rules = m[3].trim() ? m[3].trim().split(/\s+/).map((pair) => {
    const at = pair.lastIndexOf('=');
    return { id: pair.slice(0, at), ms: Number(pair.slice(at + 1)) };
  }) : [];
  return { scope: m[1], totalMs: Number(m[2]), rules };
}

// The record lines in a block of text, in the order they were written - a
// transcript entry holds one per runner that reported into it.
export function parseTimings(text) {
  return String(text ?? '').split('\n').map(parseTiming).filter(Boolean);
}
