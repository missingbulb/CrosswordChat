// RETIRED PATH, kept as a shim until #2115 for a member whose own workflow or local
// pack still names it. The lever is `src/schedule/create-work-item.mjs`, run directly.
// @legacy-tolerance advisory:tasks-retired-public-paths retire:#2115
import { pathToFileURL } from 'node:url';
import { runCreateWorkItem } from '../src/schedule/create-work-item.mjs';

// The surface this path publishes, named rather than left to the star: a member's
// own local pack may import it, and `export *` says nothing a reader — or the
// consumer-safe-change check — can see.
export {
  runCreateWorkItem, createWorkItem, wakeItem, parseArgs, FORCED_CONTEXT,
} from '../src/schedule/create-work-item.mjs';

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCreateWorkItem().catch((e) => { console.error(e); process.exit(1); });
}
