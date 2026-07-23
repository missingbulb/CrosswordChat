// chrome-extension-release task: store-release — the pack-contributed release
// trigger (per-project-scheduling DESIGN §6). STRUCTURAL Stage 2: `model: 'none'`
// means the whole decision is code and there is NO agent and NO dispatch issue —
// the scheduler runs the inline `worker.mjs` directly. This task ABSORBS the
// release workflow's own independent 00:30 cron: the workflow becomes push +
// workflow_dispatch only, and this task is the one place that fires its daily
// leg, so the scheduler stays the repo's only cron (DESIGN §3, decision §11.6).
//
// Self-contained (imports nothing): the whole contract is this default export.

const norm = (v) => String(v ?? '').replace(/^v/, '').trim(); // compare tags/versions modulo a leading 'v'

export default {
  id: 'store-release',
  frequency: 'daily',              // the 04:00 slot (DESIGN §2) — replaces the workflow's own 00:30 cron
  signals: ['release', 'commits'],
  model: 'none',                   // pure code — the worker is an inline .mjs, not an agent (DESIGN §1)
  outcome: 'none',                 // it only TRIGGERS the gated publish workflow; publishing stays behind that workflow's own guards
  worker: 'worker.mjs',            // model:none → the worker is the inline module named here, run by the scheduler

  // Detect a deployable change since the last release, entirely in code:
  //   (a) the manifest version has advanced past the latest published release
  //       (an unreleased bump — the same signal the old run_daily gate used), OR
  //   (b) a substantive default-branch commit landed in the window (a real ship).
  // Ship-path precision (the daily job's `ship_paths` filter) is NOT re-derived
  // here — .github/release.config isn't in a precondition's scope — because the
  // dispatched daily workflow does the authoritative shipped-file diff vs the
  // latest release tag and no-ops when nothing shippable moved. So the
  // precondition is the cheap pre-filter; the workflow is the exact gate.
  precondition(signals) {
    const rel = signals.release ?? {};
    const shipped = norm(rel.manifestVersion);
    const released = norm(rel.latestTag);
    const manifestAhead = shipped !== '' && shipped !== released;
    const substantive = signals.commits?.substantiveChange === true;

    if (manifestAhead) {
      return { run: true, reason: released ? `manifest ${shipped} is ahead of released ${released}` : `manifest ${shipped}, no release yet` };
    }
    if (substantive) {
      return { run: true, reason: 'substantive default-branch change in the window — let the daily release workflow diff shipped files' };
    }
    return { run: false, reason: 'manifest matches the latest release and no substantive change in the window' };
  },
};
