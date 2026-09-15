// PUBLIC ENTRY POINT — a command, never logic.
//
// Named as a literal path by something this repository cannot rewrite: a member's
// `.github/workflows/`, which lands only as a pull request somebody merges; a
// routine's stored prompt, which is a per-repo console setting; or prose in a
// member's own local pack, which no converge may touch. A member spends every
// window between its mount refreshing (nightly) and those being re-pointed
// (whenever) running whichever path it still names — so a run that finds nothing
// here is a repo whose queue stops silently, with no run left to fix it.
//
// `public/` is where that promise is kept: a name here does not move, and nothing
// may put behaviour behind one. The mechanism lives under `src/`.
//
// `tick.mjs` is the scheduler run's pre-#877 name. A member whose scheduler
// workflow still says `tick.mjs` is behind the mount and should be re-converged —
// which this says in its own log, since nothing else would notice.

import { runSchedulerRun } from '../src/schedule/run.mjs';

console.log('- invoked as `tick.mjs`, which is the old name for the scheduler run —'
  + ' this repo\'s scheduler workflow is behind the mount and should be re-converged');
runSchedulerRun().catch((e) => { console.error(e); process.exit(1); });
