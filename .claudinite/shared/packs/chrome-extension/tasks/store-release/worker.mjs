// store-release worker. This task is
// `agent_model: 'none'` with `code_worker_mjs: 'worker.mjs'`, so the
// scheduler runs THIS FILE as a subprocess (cwd = this task dir) bounded by
// `code_work_timeout` — there is no agent phase on
// success. Its one job is to TRIGGER the repo's vendored `Release to Chrome
// Store` orchestrator in daily mode and hand off: the orchestrator's `daily` leg
// does the authoritative shipped-file diff, patch bump, and gated submission, so
// this worker never decides what ships and never publishes anything itself.
//
// This absorbs the release workflow's retired 00:30 cron:
// the scheduler is the repo's only cron, and this is the surface
// that fires the daily release.
//
// It reads nothing for itself: the runner hands it the repository, the branch and a
// REST client already carrying the Action's token. A non-204 dispatch, or a throw,
// exits non-zero - the scheduler then converges the task to needs-human.


// The vendored orchestrator's file name and the dispatch mode that runs its daily
// leg (release-workflows.mjs STUB_FILE / RELEASE.md §Workflow). Bare literals —
// this worker imports nothing from the engine, and the name is the
// conformance-pinned fingerprint.
const ORCHESTRATOR_FILE = 'chrome-extension-release.yml';
const DISPATCH_MODE = 'daily';

export async function worker({ repo, defaultBranch, gh, log }) {
  const ref = defaultBranch ?? 'main';

  // Fire the orchestrator's daily leg via workflow_dispatch — the orchestrator is
  // push + workflow_dispatch only now (its own cron retired), so this is the sole
  // scheduled trigger of the daily release. A 204 is success.
  const res = await gh(`/repos/${repo}/actions/workflows/${ORCHESTRATOR_FILE}/dispatches`, {
    method: 'POST',
    body: { ref, inputs: { mode: DISPATCH_MODE } },
  });
  if (res.status !== 204) {
    throw new Error(`dispatching ${ORCHESTRATOR_FILE} (mode ${DISPATCH_MODE}) on ${ref} returned ${res.status}`);
  }
  log(`dispatched ${ORCHESTRATOR_FILE} (mode ${DISPATCH_MODE}) on ${ref}`);

  // STUB (unchanged from the pre-conversion worker): this triggers the daily
  // release and hands off. The full Stage-2 would then AWAIT the dispatched run
  // (poll it to conclusion) and report at completion — now safe to add, because
  // the subprocess is bounded by code_work_timeout, but it needs a
  // generous timeout and is left as the next increment.
}
