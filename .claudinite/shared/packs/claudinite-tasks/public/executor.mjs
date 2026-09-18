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
// The executor: the pull worker that claims a ready item, runs it, and converges
// it or hands it to an agent session.

import { pathToFileURL } from 'node:url';
import { runExecutorJob } from '../src/execute/loop.mjs';

// The surface this path published, named rather than left to the star: a member's
// own local pack may import it, and `export *` says nothing a reader — or the
// consumer-safe-change check — can see.
export {
  runExecutorJob, runExecutor, claimComment, claimWinner, conflictsWithEarlierClaim,
  noGoPlan, rollBody,
} from '../src/execute/loop.mjs';
export {
  pickOrder,
} from '../src/items/pick-order.mjs';
export {
  evaluatePrecondition,
} from '../src/contract/precondition.mjs';

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runExecutorJob().catch((e) => { console.error(e.message ?? e); process.exit(1); });
}
