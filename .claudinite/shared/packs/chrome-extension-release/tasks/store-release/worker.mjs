// store-release inline worker (per-project-scheduling DESIGN §6). This task is
// `model: 'none'`, so there is no agent and no dispatch issue: the scheduler runs
// this module inline once the precondition says a deployable change exists. Its
// one job is to TRIGGER the repo's vendored `Release to Chrome Store` orchestrator
// in daily mode and hand off — the orchestrator's `daily` leg does the
// authoritative shipped-file diff, patch bump, and gated store submission, so this
// worker never decides what ships and never publishes anything itself.
//
// This absorbs the release workflow's own retired 00:30 cron (decision §11.6): the
// scheduler is the repo's only cron, and THIS is the surface that fires the daily
// release. The worker runs Action-side, so it uses the injected `gh`
// (GITHUB_TOKEN over the Actions REST API) — the one sanctioned non-MCP surface
// (DESIGN §10); it is not an in-session agent.
//
// Signature is the scheduler's inline-worker contract (engine/scheduler/run.mjs):
//   default export async ({ gh, repo, ctx, slotId }) => void
//     gh     — async (path, { method, body }) => { status, json }  (Actions REST)
//     repo   — 'owner/name'
//     ctx    — the resolved run context (default branch, config, …)
//     slotId — the daily slot id, e.g. 'd2026-07-22' (for logging/traceability)

// The vendored orchestrator's file name and the dispatch mode that runs its daily
// leg (packs/chrome-extension-release/release-workflows.mjs STUB_FILE / RELEASE.md
// §Workflow). Kept as bare literals — this worker imports nothing (the inline
// self-contained rule), and the name is the conformance-pinned fingerprint.
const ORCHESTRATOR_FILE = 'chrome-extension-release.yml';
const DISPATCH_MODE = 'daily';

export default async function storeRelease({ gh, repo, ctx, slotId }) {
  // The ref the workflow_dispatch runs against — the repo's default branch, where
  // the daily leg pushes its patch bump. `ctx.defaultBranch` is resolved for every
  // scheduler run; fall back to 'main' if a caller omitted it.
  const ref = ctx?.defaultBranch || 'main';

  // Fire the orchestrator's daily leg via the workflow_dispatch REST endpoint. The
  // orchestrator is push + workflow_dispatch only now (its own cron retired), so
  // this dispatch is the sole scheduled trigger of the daily release.
  const res = await gh(`/repos/${repo}/actions/workflows/${ORCHESTRATOR_FILE}/dispatches`, {
    method: 'POST',
    body: { ref, inputs: { mode: DISPATCH_MODE } },
  });

  // A workflow_dispatch POST returns 204 on success. Anything else (the workflow
  // file absent on a repo mid-vendoring, a permissions gap) is logged for the job
  // summary — the scheduler's inline-worker caller already wraps this in try/catch,
  // so a failure here converges to the run's failure reporting rather than throwing.
  if (res.status !== 204) {
    console.log(`! store-release [${slotId}]: dispatching ${ORCHESTRATOR_FILE} (mode ${DISPATCH_MODE}) on ${ref} returned ${res.status}`);
    return;
  }
  console.log(`store-release [${slotId}]: dispatched ${ORCHESTRATOR_FILE} (mode ${DISPATCH_MODE}) on ${ref}`);

  // STUB: this fires the daily release and hands off. The full Stage-2 behavior
  // would then AWAIT the dispatched run (poll the Actions run it just created via
  // `gh`, until conclusion) and report at completion rather than at the trigger —
  // the same trigger-and-await shape RELEASE.md names as the follow-up once the
  // readiness signal is trusted. Left as a trigger-only stub deliberately: awaiting
  // a store submission inside the hourly scheduler run is the next increment, not
  // this one.
}
