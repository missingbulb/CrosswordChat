// RETIRED PATH, kept as a shim until #2115 for a member whose own workflow or local
// pack still names it. The escalation is `src/recover/workflow-failure.mjs`, which the stub now runs directly.
// @legacy-tolerance advisory:tasks-retired-public-paths retire:#2115
import { pathToFileURL } from 'node:url';
import { runWorkflowFailureReport } from '../src/recover/workflow-failure.mjs';

// The surface this path published, named rather than left to the star: a member's
// own local pack may import it, and `export *` says nothing a reader — or the
// consumer-safe-change check — can see.
export {
  runWorkflowFailureReport, reportWorkflowFailure, findOpenFailureIssue, runUrl,
  FAILURE_LABELS, WORKFLOW_FAILURE, SCHEDULER_FAILURE_TITLE,
} from '../src/recover/workflow-failure.mjs';

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runWorkflowFailureReport().catch((e) => { console.error(e.message ?? e); process.exit(1); });
}
