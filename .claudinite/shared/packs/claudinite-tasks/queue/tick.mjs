// WORKFLOW AND ROUTINE ABI — an entry point, never logic.
//
// Every module in this folder is named as a literal path by a file this repository
// cannot push to: a member's `.github/workflows/`, which lands only as a pull
// request somebody merges, or a routine's stored prompt, which is a per-repo
// console setting. A member therefore spends every window between its mount
// refreshing (nightly) and its workflows being re-merged (whenever) running the
// new code from the old path — so these paths are frozen, and a run that finds
// nothing here is a repo whose queue stops silently with no run left to fix it.
//
// They are the ABI, not a compatibility tolerance: nothing retires them, and
// nothing may put behaviour behind one. The mechanism lives under `src/`.
//
// `tick.mjs` is the scheduler run's pre-#877 name. A member whose scheduler
// workflow still says `tick.mjs` is behind the mount and should be re-converged —
// which this says in its own log, since nothing else would notice.

import { runSchedulerRun } from '../src/schedule/run.mjs';

console.log('- invoked as `tick.mjs`, which is the old name for the scheduler run —'
  + ' this repo\'s scheduler workflow is behind the mount and should be re-converged');
runSchedulerRun().catch((e) => { console.error(e); process.exit(1); });
