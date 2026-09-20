// RETIRED PATH, kept as a shim until #2115 for a member whose own workflow or local
// pack still names it. The executor is `src/execute/loop.mjs`, which the stub now runs directly.
// @legacy-tolerance advisory:tasks-retired-public-paths retire:#2115
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
