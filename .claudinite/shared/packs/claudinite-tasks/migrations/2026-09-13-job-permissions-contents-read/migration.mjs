// Put `contents: read` into every job-level permissions block of the two live
// workflows (#1993).
//
// WHAT IT FIXES. A job-level `permissions:` block REPLACES the workflow-level set rather
// than adding to it — every scope it does not name is `none`. The scheduler's `drain`
// and `report-failure` jobs and the executor's `continue-the-chain` each carry such a
// block, so they ran with `contents: none`, and `actions/checkout` on a PRIVATE member
// fails with "Repository not found" before the job's module ever runs. A public member
// never sees it, because checkout falls back to an anonymous read — which is why the
// shape survived: the drain is the guaranteed delivery, so on a private member every
// ready item waited for a label event or a hand dispatch, and the failing run filed a
// failure escalation whose own job could not check out either.
//
// A REWRITE, NOT A MATERIALIZE, for the reason `executor-vars-bag` gives: the two
// workflows are not identical across members — the scheduler carries each repo's own
// cron, the executor its own stamped `required_secrets` — and copying the stub over
// either would take those with it. A rewrite preserves everything it does not name.
//
// THE ANCHORS are the three job-level blocks exactly as the stubs shipped them, each
// closed by its `steps:` line so the workflow-level block (which already grants
// `contents: write`) can never match. Idempotency lives in the anchor itself: once
// `contents: read` sits under `permissions:`, the literal no longer occurs, and
// `appliesTo` reads the destination for the same reason — inert on a member that
// scaffolded the fixed stub at adoption.
//
// A record must be self-contained: it is read on a repo whose mount holds only the
// records that still apply to it, so nothing here imports a sibling record.
const SCHEDULER = '.github/workflows/claudinite-scheduler.yml';
const EXECUTOR = '.github/workflows/claudinite-executor.yml';

const REWRITE = [
  { file: SCHEDULER, replace: [
    { from: '    permissions:\n      actions: write\n    steps:',
      to:   '    permissions:\n      contents: read\n      actions: write\n    steps:' },
    { from: '    permissions:\n      issues: write\n    steps:',
      to:   '    permissions:\n      contents: read\n      issues: write\n    steps:' },
  ] },
  { file: EXECUTOR, replace: [
    { from: '    permissions:\n      actions: write\n      issues: write\n    steps:',
      to:   '    permissions:\n      contents: read\n      actions: write\n      issues: write\n    steps:' },
  ] },
];

// True while either live workflow still carries a block this record retires.
const carriesRetiredBlock = async (read) => {
  for (const { file, replace } of REWRITE) {
    const text = await read(file);
    if (text && replace.some(({ from }) => text.includes(from))) return true;
  }
  return false;
};

export default {
  id: 'job-permissions-contents-read',
  landed: '2026-09-13',
  version: '60913.5',
  summary: 'every job-level permissions block in the scheduler and executor workflows reads contents, so the drain, the failure escalation and the chain continuation can check out a private member (#1993)',

  appliesTo: carriesRetiredBlock,
  rewrite: REWRITE,
  legacyPresent: async (_exists, read) => carriesRetiredBlock(read),
};
