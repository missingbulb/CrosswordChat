
// The basics pack: cross-project working discipline, the task lifecycle, and the general
// engineering skills. Active only where a repo declares it, and never fingerprinted.
//
// Its skills/ holds the general engineering practice any project's work can call for, whatever
// its technology, mounted wherever this pack is declared.
import { contributedBarrierRules } from './barriers.mjs';

export default {
  // A migration record's declared `version` must be ≤ this number, and this number must
  // MOVE for that record to reach a member already at the previous one:
  // `migrationApplies` is `want > have` against the stamped version, and what gets
  // stamped is this manifest's number — so a record declaring a version above it would
  // re-apply every cycle, forever, draining never.
  version: '60925.5',
  minEngineVersion: '60925.1',
  ruleRoutingGuidance: {
    belongs: 'cross-project working discipline, issue-branch-PR lifecycle, repo hygiene, doc/reference integrity and the general engineering, testing and debugging skills',
    excludes: 'technology-specific content — its own tech pack; git procedure and GitHub Actions workflow or platform behaviour — git-github',
  },
  seededByDefault: true,
  // `claudinite-lifecycle` is required rather than assumed: this pack is declared everywhere, so
  // the closure is what puts Claudinite's own rules in front of every session.
  // git-github carries the git/GitHub side of the task lifecycle (#385).
  requires: ['claudinite-lifecycle', 'git-github'],
  // The directed folder-access graph, absorbed from the `barriers` pack (#1681):
  // the config-driven `barrier` rule in worldRules/, and this seam, which reads the
  // FIXED barriers other active packs carry as manifest data
  // (contributes: { barriers: [...] }) and builds each into a first-class rule.
  // Composition is declaration + configuration, never a code import
  // (pack-independence) — which is the property the mechanism exists to provide.
  // The guide is barriers.md; the contribution key keeps its own name because it
  // names the mechanism rather than the pack that used to house it.
  contributedRules: (activePacks) => contributedBarrierRules(activePacks),
  // `ci-performance` and `improve-comments` are this pack's scheduled tasks,
  // discovered by the scheduler's filesystem scan (packs/claudinite-tasks/discover.mjs)
  // rather than declared here, as its rules are from `worldRules/`, `workRules/`
  // and `declared-checks.json`.
};
