// Signal collection for ONE task (docs/PRINCIPLES.md): exactly that
// task's declared union, collected at the moment a verdict is asked for. Two
// callers ask — the scheduler run at every tick (a read it cannot make fails open
// there) and the executor at pick, which re-derives rather than trusting the
// tick's answer forward.
//
// THE RUN HISTORY COMES FIRST, always: the `runs` bundle is what the cadence
// terms read, and it is also what sets the WINDOW every other collector reads
// over — since this task's newest run started, so a task reads exactly what moved
// since it last looked, and one that declined for a week then sees the week. With
// no run in the horizon the window is the task's own cadence (a day for a task
// stating none) plus an hour of slack. Overlap at the seam — a run's own duration
// — is absorbed by the preconditions' own dedupe, as the old fixed lookback's was.

import { itemFacts } from '../items/work-item.mjs';
import { taskSignalNames } from '../contract/task-contract.mjs';
import { DAY_MS, defaultWindowMs, windowDaysOf } from '../contract/precondition.mjs';

// Republished from the contract that owns them: a caller reading a task's window
// off its collected signals asks the collector, not two modules.
export { defaultWindowMs, windowDaysOf };

// The window, from the run history: `{ sinceIso, days }`. The newest run that
// actually ran — a `rejected` item declined at pick and did nothing, so it does not
// move the seam — anchors it at its start; none in the horizon falls back to the
// task's default.
export function windowFromRuns(task, runs, now) {
  const nowMs = new Date(now).getTime();
  const last = (runs?.list ?? []).find((r) => r.outcome !== 'obsolete');
  const sinceMs = last && Number.isFinite(new Date(last.createdAt).getTime())
    ? new Date(last.createdAt).getTime()
    : nowMs - defaultWindowMs(task);
  return { sinceIso: new Date(sinceMs).toISOString(), days: (nowMs - sinceMs) / DAY_MS };
}


// A collector factory bound to this run's repo context; the returned function is
// the `collectSignalsFor` seam the scheduler run and the executor call.
//
// `items` is the queue where the caller already fetched it (the scheduler run),
// so the run history of every task costs no read. `only` narrows a collection to
// the named signals — the scheduler's cheap first pass asks for `['runs']` alone
// and judges the run-history terms before anything else is collected.
export function collectSignalsForTask({ gh, repo, root, config, defaultBranch, items = null }) {
  return async function collectFor(task, now, item = null, { only = null } = {}) {
    const { collectSignals } = await import('./index.mjs');
    const { buildSignalContext } = await import('./context.mjs');
    const names = taskSignalNames(task.decl, task.terms);
    const packConfigFor = (packId) => config.packConfig?.[packId] ?? {};
    const nowIso = new Date(now).toISOString();
    const facts = itemFacts(item);
    const taskRef = { pack: task.pack, id: task.id };

    const rest = (only ? names.filter((n) => only.includes(n)) : names).filter((n) => n !== 'runs');
    // The history first, on its own: it needs no window and decides the window. It
    // is read only where something reads it — a run-history term, or a collector
    // that windows on it. A task reading nothing but the item it was created for
    // (the request implementer) pages no issue list at every pick.
    const windowless = new Set(['request']);
    const needsHistory = names.includes('runs') || rest.some((n) => !windowless.has(n));
    if (!needsHistory) return rest.length ? await collectSignals(gh, buildSignalContext({ root, repo, defaultBranch, now: nowIso, sinceIso: null, config, packConfigFor, item: facts, task: taskRef, items }), rest) : {};
    const history = buildSignalContext({ root, repo, defaultBranch, now: nowIso, sinceIso: null, config, packConfigFor, item: facts, task: taskRef, items });
    const { runs } = await collectSignals(gh, history, ['runs']);
    const window = windowFromRuns(task, runs?.error ? null : runs, now);
    const out = { runs: { ...runs, window } };
    if (!rest.length) return out;

    // The fleet aggregate is a full enumeration over a wider credential, so it is
    // built only when THIS task declares it and only where that credential exists.
    // Absent, the collector returns null and a fleet task's precondition declines
    // rather than crashing.
    let fleet = null;
    if (rest.includes('fleet')) {
      const { readFleet, makeFleetGh } = await import('./fleet.mjs');
      const fleetGh = makeFleetGh();
      if (fleetGh) {
        fleet = await readFleet(fleetGh, { owner: repo.split('/')[0], canonRepo: repo, sinceIso: window.sinceIso });
        if (fleet.error) console.log(`! fleet enumeration: ${fleet.error}`);
      } else {
        console.log('- this task declares the `fleet` signal but FLEET_GITHUB_TOKEN is not set');
      }
    }

    const ctx = buildSignalContext({
      root, repo, defaultBranch, now: nowIso, sinceIso: window.sinceIso, config, fleet, packConfigFor,
      // The occurrence's own facts, for the collector that reads one named object
      // rather than a window (the request read, PRINCIPLES.md).
      item: facts, task: taskRef, items,
    });
    return { ...out, ...(await collectSignals(gh, ctx, rest)) };
  };
}
