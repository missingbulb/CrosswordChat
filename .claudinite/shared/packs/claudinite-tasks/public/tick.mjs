// RETIRED PATH, kept as a shim until #2115 for a member whose own workflow or local
// pack still names it. The scheduler run is `src/schedule/run.mjs`.
// @legacy-tolerance advisory:tasks-retired-public-paths retire:#2115
import { runSchedulerRun } from '../src/schedule/run.mjs';

console.log('- invoked as `tick.mjs`, which is the old name for the scheduler run —'
  + ' this repo\'s scheduler workflow is behind the mount and should be re-converged');
runSchedulerRun().catch((e) => { console.error(e); process.exit(1); });
