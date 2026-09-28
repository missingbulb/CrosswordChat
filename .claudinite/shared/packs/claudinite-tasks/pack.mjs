// claudinite-tasks — the whole scheduled-work surface: the queue, the executor, the
// task contract, and the delivery lane a task's output lands through. The mechanism as
// testable claims is docs/PRINCIPLES.md; how it is wired into a repo is this pack's README.
//
// The pack is seeded at `--init` and carries no fingerprint, and `public/` is the one place
// in the corpus another pack's code may import across a pack boundary.
export default {
  version: '60928.1',
  minEngineVersion: '60925.1',
  ruleRoutingGuidance: {
    belongs: 'scheduled work — the work-item queue, the executor, the task contract and its signals, run records, code-work, delivery',
    excludes: 'authoring a task — claudinite-growth; this repo\'s Claudinite status — claudinite-lifecycle; rendering queue state — claudinite-dashboard',
  },
  pitch: 'Gives the repo scheduled, unattended work in GitHub Actions: a queue of work items, an executor that runs each one on cadence or on demand, and a delivery lane that lands results as pull requests. Without it a repo runs no scheduled work at all. Its own tasks record usage and what the machinery costs, and run coded production checks against live URLs after a change merges, since a session cannot reach them. About a dozen checks keep task declarations and the scheduler\'s structure sound.',
  seededByDefault: true,
};
