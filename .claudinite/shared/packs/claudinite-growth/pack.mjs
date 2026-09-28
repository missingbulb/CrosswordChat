
// The growth lifecycle, repo side: a declaring repo captures its own lessons into its
// local packs and prunes them back out once the shared canon covers them. The stages are
// scheduled tasks under this pack's own `tasks/`, found by the scheduler's filesystem
// scan, so none of them is declared here; each stage's method is a skill under `skills/`,
// stating the action and naming no corpus. The pack also owns conversation capture
// (capture-log.mjs, session-end.mjs) and the task-authoring contract. What it does NOT
// own: the central promote stage and the canon shelf's own sweeps
// (claudinite-canon-curation), this repo's Claudinite status and adoption
// (claudinite-lifecycle), fleet-wide aggregation (claudinite-fleet-sheepdog).
//
// Every task here writes `.claudinite/local/packs/` and nothing else.
export default {
  version: '60927.2',
  minEngineVersion: '60925.1',
  ruleRoutingGuidance: {
    belongs: 'authoring Claudinite content here — lesson extraction, dedup, revalidation, conversation logs, skill-usage folding, the task contract',
    excludes: 'this repo\'s Claudinite status — mount, declaration, adoption, update — claudinite-lifecycle; code comments — basics; fleet sweeps — claudinite-fleet-sheepdog',
  },
  pitch: 'Lets the repo learn from its own work. Scheduled tasks read recent commits, merged pull requests and captured Claude Code conversations for lessons worth keeping, and land them as rules in the repo\'s own packs through pull requests that merge after CI. Other tasks turn testable prose into coded checks, re-verify rules about outside platforms, review which rules actually get used, and prune what the shared library now covers. About a dozen skills carry the method, led by extracting lessons from activity and conversations and converting prose to checks.',
  seededByDefault: true,
  requires: ['claudinite-lifecycle'],
};
