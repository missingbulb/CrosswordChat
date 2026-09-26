// Scope-blind mechanism: hold a newly-added check to its grace window, apply the
// project's on_fail overrides and acceptances, order blocking-first, print each
// finding, and print the one-line summary.
// Returns the blocking count so a runner's exit code is `blocking ? 1 : 0`.
// `scopeLabel` only names the run in the summary line (e.g. "world" / "work") —
// this file carries no scope logic of its own.
import { applyConfig, applyGrace, render } from './helpers/findings.mjs';

export function reportFindings(findings, config, { scopeLabel, mode, baseRef, now = new Date() }) {
  const resolved = applyConfig(applyGrace(findings, { now }), config)
    .sort((a, b) => (a.on_fail === b.on_fail ? 0 : a.on_fail === 'block' ? -1 : 1));
  for (const f of resolved) console.log(`${render(f)}\n`);
  const blocking = resolved.filter((f) => f.on_fail === 'block').length;
  const advisory = resolved.length - blocking;
  if (resolved.length) {
    console.log(`${blocking} blocking, ${advisory} advisory (${scopeLabel} scope: ${mode}${baseRef ? ` vs ${baseRef}` : ''}).`);
  }
  return blocking;
}
