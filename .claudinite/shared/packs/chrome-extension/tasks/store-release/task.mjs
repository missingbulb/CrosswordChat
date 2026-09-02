// chrome-extension task: store-release — the pack-contributed release
// trigger (per-project-scheduling DESIGN §6). STRUCTURAL Stage 2: `model: 'none'`
// means the whole decision is code and there is NO agent phase —
// the executor runs `worker.mjs` as code-work. This task ABSORBS the
// release workflow's own independent 00:30 cron: the workflow becomes push +
// workflow_dispatch only, and this task is the one place that fires its daily
// leg, so the scheduler stays the repo's only cron (DESIGN §3, decision §11.6).
//
// The whole contract is this default export; the unreleased-bump condition it
// names lives in preconditions.mjs beside it.

export default {
  id: 'store-release',
  frequency: 'daily',              // the 04:00 anchor (DESIGN §2) — replaces the workflow's own 00:30 cron
  // Either an unreleased manifest bump (preconditions.mjs beside this file), or a
  // substantive change the dispatched workflow can diff shipped files against.
  // Ship-path precision is deliberately NOT re-derived here: the daily workflow
  // does the authoritative shipped-file diff against the latest release tag and
  // no-ops when nothing shippable moved, so this is the cheap pre-filter and the
  // workflow is the exact gate.
  //
  // A repo that carries this pack but does NOT ship the Chrome Web Store pipeline
  // has no daily workflow for this task to fire. That is a fact adoption settled,
  // not a question worth re-asking nightly: such a repo names
  // `chrome-extension/store-release` in its `taskScheduler.disabledTasks`.
  preconditions: ['manifest-ahead || substantive-change'],
  agent_model: 'none',                   // pure code — no agent (task-code-work DESIGN §4)
  expected_outcome: 'none',                 // it only TRIGGERS the gated publish workflow; publishing stays behind that workflow's own guards
  code_work: 'node worker.mjs',      // the executor runs this as code_work (cwd = this task dir) — DESIGN §3
  code_work_timeout: 120,            // the dispatch is a quick REST call; a tight bound (the await-the-run Stage 2 would widen it)
};
