// RETIRED PATH, kept as a shim until #2115 for a member whose own workflow or local
// pack still names it. The adoption step is `src/adopt/converge-workflows.mjs`, run directly.
// @legacy-tolerance advisory:tasks-retired-public-paths retire:#2115
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
