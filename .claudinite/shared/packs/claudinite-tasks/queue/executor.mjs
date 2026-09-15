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
// The executor: the pull worker that claims a ready item, runs it, and converges
// it or hands it to an agent session.

import { pathToFileURL } from 'node:url';
import { runExecutorJob } from '../src/execute/loop.mjs';

export * from '../src/execute/loop.mjs';
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
