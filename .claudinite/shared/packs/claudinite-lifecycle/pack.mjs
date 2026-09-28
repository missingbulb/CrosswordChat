
// Claudinite's own surface in a repo that runs it: the vendored mount, the
// declaration that activates a pack, adopting Claudinite and adopting a pack.
//
// EVERY RULE HERE JUDGES A MEMBER'S CLAUDINITE STATUS — is this repo declared,
// converged, gated and scheduled such that Claudinite works in it. Rules about
// how the canon's own content is maintained are not this pack's, however much
// they look like it.
//
// MANDATORY. `basics` requires this pack, which both vendors its content and
// materializes its declaration wherever a declaration is written; the
// migrations/2026-08-14-core-seed record declares it into members that already
// exist. Both run outside any check, because activation reads the literal
// declaration.
export default {
  version: '60927.2',
  minEngineVersion: '60925.1',
  ruleRoutingGuidance: {
    belongs: 'using Claudinite itself — the vendored mount, the pack declaration, bootstrapping, adopting packs, the self-refresh update',
    excludes: 'working discipline and the task lifecycle — basics; authoring Claudinite content, scheduled tasks included — claudinite-growth; git — git-github',
  },
  pitch: 'The groundwork that keeps the system itself correct in a repo. Its two skills adopt the whole setup and add individual packs, each with its adoption questions and scaffolding. A scheduled update task brings the repo to the current engine and pack versions through a tested pull request, and another adopts packs the repo has been asked to take on. About a dozen rules and more than a dozen checks stop sessions from editing vendored files in place or assuming a pack is active when it was never declared.',
  seededByDefault: true,
  // The consumer-isolation wall (claudinite-isolation) is a declared check — a
  // forbidReferences entry in this pack's declared-checks.json, run by the
  // engine's reference-scanning like any barrier, so it needs nothing else
  // declared. The per-repo config rule a member's own edges ride now lives in
  // `basics` (#1681), which this pack cannot require back without a cycle —
  // `basics` requires this one. It is seeded into every member anyway.
  // Both scheduled tasks live in this pack's `tasks/`, discovered by the
  // scheduler's filesystem scan (packs/claudinite-tasks/discover.mjs) rather than
  // declared here: `update`, the per-repo self-refresh every member runs, and
  // `adopt-requested-packs`, which acts on a repo's pack-adoption requests.
  //
  // `update` being HERE is what `claudinite-lifecycle-declared` is blocking for. A member runs it
  // from its vendored copy and discovery finds only a literally-declared pack's
  // tasks, so a repo that loses this pack's entry loses its self-refresh — and
  // nothing is left that could deliver it one.
};
