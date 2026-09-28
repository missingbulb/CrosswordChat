// Scope-blind mechanism (no policy, no scope knowledge): given a built context
// and the discovered packs, run the ACTIVE packs' rules that a caller-supplied
// predicate admits, and return their findings. The world and work runners each
// call this with their own `includeRule` — this file never names a scope, so
// the two runners stay independent of each other while sharing the walk.
import { runRule } from './helpers/work.mjs';
import { isActive } from '../pack_loader/pack-registry.mjs';

// The full rule catalog the given packs carry, id-sorted: a pack's own rules and
// the checks its bundled skills own. The ONE place the sources are summed - `--list`
// prints it and the catalog's own tally guard counts it, so neither can disagree
// with the runner about what rules exist, and a source added later lands in both
// for free.
export function packRules(packs) {
  return [
    ...packs.flatMap((p) => p.rules ?? []),
    ...packs.flatMap((p) => p.skillChecks ?? []),
  ].sort((a, b) => a.id.localeCompare(b.id));
}

// Every finding from the active packs' rules that `includeRule` admits. A rule
// turned `off` in settings is skipped. `timings`, when a caller passes an array, collects
// `{ id, ms }` per rule run - what the runner renders its timing record from.
export function runActivePackRules(ctx, packs, { includeRule, timings = null }) {
  const findings = [];
  // Expose the discovered packs to any rule that reasons about pack metadata
  // (e.g. the adoption-interview hygiene check reads each active pack's declared
  // questions) — checks run synchronously and can't re-discover packs themselves.
  ctx.packs = packs;
  const activePacks = packs.filter((p) => isActive(p, ctx.config));
  const planned = activePacks.flatMap((pack) => [...(pack.rules ?? []), ...(pack.skillChecks ?? [])]).filter((rule) => includeRule(rule) && ctx.config.rules[rule.id] !== 'off');
  ctx.plannedRules = planned;
  for (const rule of planned) {
    const started = timings ? performance.now() : 0;
    findings.push(...runRule(rule, ctx));
    if (timings) timings.push({ id: rule.id, ms: performance.now() - started });
  }
  return findings;
}
