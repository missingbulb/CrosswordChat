
// Opt into the growth lifecycle: a repo declaring claudinite-growth contributes its
// hard-won lessons up to the Claudinite canon and prunes them back out once the canon
// owns them. This pack carries the REPO-side stages — extract, dedup, and the weekly
// prose-to-checks sweep — as scheduled tasks under this pack's
// own `tasks/`, discovered by the scheduler's filesystem scan
// (packs/claudinite-tasks/discover.mjs), so none of them is declared here. The central
// promote stage — lifting portable lessons up into the shared canon — is a home-only
// duty that runs canon-side, outside this pack; its precondition targets exactly the
// members that declare THIS pack, minus any member whose entry sets config.promote:
// false (the promotion opt-out; extraction and dedup stay local either way).
//
// EXTRACTION IS ONE TASK OVER TWO SOURCES. growth-extract (tasks/growth-extract/)
// runs the extract-from-activity skill over the window's commits/PRs/issues and the
// extract-from-conversations skill over the captured logs, then the prose-to-checks
// skill over the prose it just wrote, and lands all of it in one PR delivered
// per the repo's delivery settings.
// The halves were two tasks firing at the same nightly anchor against the same local
// packs; they shared the bar, the ladder and the dedup surface, so the split bought
// nothing and cost a second opus dispatch, a second PR, and two runs deduping
// against a corpus the other was concurrently writing.
//
// The pack also owns the CONVERSATION lifecycle: capture-log.mjs pushes a session's
// conversation onto the orphan conversation-logs branch (in-session — it needs the
// live transcript), driven by TWO events: merge-to-main's capture step, keyed to
// the pull request it landed, and session-end.mjs, with --issue 0, invoked by the
// engine's SessionEnd hook runner. The second is best-effort and captures what the
// first structurally cannot — sessions that never merge, and the post-merge tail of
// the ones that do; it is safe to double-write because capture deltas on the session
// id. growth-extract's conversation half then mines those pushed logs on its own
// access model — the logs branch is in the repo, so reading it, committing lessons to
// local packs are plain local git (the logs branch itself is read-only to it); only
// posting the short summary behind each extracted rule on its issue uses the GitHub
// MCP tools. RETENTION IS A SEPARATE, AGENTLESS TASK (tasks/logs-prune/): deleting a
// capture past config.retention_days is arithmetic on dates, and keeping it inside
// the opus run also kept a precondition arm alive whose only job was to dispatch
// that run on a quiet repo. Age is enough because of the extract run's reading
// window — it reads from the oldest end of the branch every run — not because the
// two tasks hand anything to each other.
//
// THE SKILL-USAGE METRIC IS NOT HERE, though it is the promotion ladder's
// skill-vs-prose call that wants it: the per-repo usage aggregate is folded out of
// the captured logs by the claudinite-tasks pack, and fleet-wide aggregation by the
// claudinite-fleet-sheepdog pack, in the fleet-enforcer repo — the canon knows
// mechanisms, never repos.
//
// ADOPTION IS NOT HERE EITHER. `adopt-claudinite`, `adopt-pack` and the
// adopt-requested-packs task belong to the claudinite-lifecycle pack: their subject
// is Claudinite's own surface in a repo, not the lessons that repo produces.
//
// rule-revalidation (tasks/rule-revalidation/) covers the failure mode the other
// stages structurally cannot see: a rule that was right, and whose ENVIRONMENT
// moved. A claim about the harness, a token's reach or an MCP tool's existence is
// falsified by a platform this repo does not control, and nothing here goes red
// when it happens — so the trigger is the calendar, and the method is re-running
// the probe rather than re-reading the prose.
//
// EVERY TASK HERE WRITES `.claudinite/local/packs/` AND NOTHING ELSE. This pack
// runs in every declaring member, where the canon is a read-only mount the next
// converge replaces whole, so its corpus is the repo's own local packs by
// construction rather than by configuration. The same actions over a canon's
// `packs/` shelf are claudinite-canon-curation's tasks, which load these skills —
// skills/ here carries the method and names no corpus, so a second caller needs
// no copy of it.
//
// A declared pack (no fingerprint), seeded like the baseline: --init seeds it into every
// new repo, the one-time grow-with-claudinite-seed migration seeds the existing fleet,
// and the update flows never re-add it — so removing it is a durable opt-out.
//
// No adoption question over config.retention_days — the task carries the default
// (DEFAULT_RETENTION_DAYS, in tasks/logs-prune/prune-logs.mjs) rather than something
// every adopter must weigh in on, and a project overrides it by declaring the value.
// The default is what "unset = capture-only" turned out to need: absence read as
// fail-safe and behaved as an unbounded leak, since no adoption flow asked for the
// value and nothing seeded it (#1620). Capture-only is now declared, not inferred.
export default {
  version: '60915.4',
  minEngineVersion: '60822.1',
  ruleRoutingGuidance: {
    belongs: 'authoring Claudinite content here — lesson extraction, dedup, revalidation, conversation logs, skill-usage folding, the task contract',
    excludes: 'this repo\'s Claudinite status — mount, declaration, adoption, update — claudinite-lifecycle; code comments — basics; fleet sweeps — claudinite-fleet-sheepdog',
  },
  seededByDefault: true,
  // Growth builds on Claudinite's own surface — a lesson is routed by reading the
  // pack catalog and landed by adopting or authoring a pack — so
  // `claudinite-lifecycle` is a prerequisite rather than an ambient assumption.
  requires: ['claudinite-lifecycle'],
  // The task contract (the writing-tasks skill). Relevance-first — inert until
  // the repo carries a tasks/<name>/task.json of its own — and here rather than in
  // claudinite-lifecycle because these judge whether a task is WRITTEN correctly,
  // which is authoring, not whether Claudinite is working in this repo. The
  // contract's third rule (task-phase-discipline) is a declared check in this pack's
  // declared-checks.json, beside them.
};
