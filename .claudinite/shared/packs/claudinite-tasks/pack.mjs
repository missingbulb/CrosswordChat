// claudinite-tasks — the whole scheduled-work surface: the queue, the executor, the
// task contract, and the delivery lane a task's output lands through. The mechanism as
// testable claims is docs/PRINCIPLES.md; how it is wired into a repo is this pack's README.
//
// The pack is seeded at `--init` and carries no fingerprint, and `public/` is the one place
// in the corpus another pack's code may import across a pack boundary.
export default {
  version: '60923.3',
  minEngineVersion: '60822.1',
  ruleRoutingGuidance: {
    belongs: 'scheduled work — the work-item queue, the executor, the task contract and its signals, run records, code-work, delivery',
    excludes: 'authoring a task — claudinite-growth; this repo\'s Claudinite status — claudinite-lifecycle; rendering queue state — claudinite-dashboard',
  },
  seededByDefault: true,
};
