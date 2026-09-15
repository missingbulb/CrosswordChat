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
// Writing a member's two workflow files from the stubs — the adoption step an
// operator runs by hand, because `.github/workflows/` is the one directory a
// member's nightly converge may never write.

import { pathToFileURL } from 'node:url';
import { runConvergeWorkflows } from '../src/adopt/converge-workflows.mjs';

export * from '../src/adopt/converge-workflows.mjs';
// The surface this path publishes, named rather than left to the star.
export {
  runConvergeWorkflows, convergeWorkflows, convergeSchedulerWorkflow, convergeExecutorWorkflow,
  declaredSecrets, secretNames, stubsDir, SCHEDULER_WORKFLOW, EXECUTOR_WORKFLOW,
} from '../src/adopt/converge-workflows.mjs';

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runConvergeWorkflows();
}
