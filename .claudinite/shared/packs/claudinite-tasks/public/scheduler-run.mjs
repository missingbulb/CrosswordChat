// RETIRED PATH, kept as a shim until #2115 for a member whose own workflow or local
// pack still names it. The scheduler run is `src/schedule/run.mjs`, which the stub now runs directly.
// @legacy-tolerance advisory:tasks-retired-public-paths retire:#2115
import { pathToFileURL } from 'node:url';
import { runSchedulerRun } from '../src/schedule/run.mjs';

export * from '../src/schedule/run.mjs';
// The surface this path published, named rather than left to the star: a member's
// own local pack may import it, and `export *` says nothing a reader — or the
// consumer-safe-change check — can see.
export {
  runSchedulerRun, planSchedulerRun, planWake, pickableCount, listWorkItems,
  withOwnWrites, listMarkedIssues, blockersToResolve, parseWorkItemTitle,
  EXECUTING_LEASH_MS, FORCED_WAKE_CONTEXT,
} from '../src/schedule/run.mjs';

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runSchedulerRun().catch((e) => { console.error(e.message ?? e); process.exit(1); });
}
