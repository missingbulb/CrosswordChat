// RETIRED PATH, kept as a shim until #2115 for a member whose own workflow or local
// pack still names it. The drain is `src/schedule/drain-dispatch.mjs`, which the stub now runs directly.
// @legacy-tolerance advisory:tasks-retired-public-paths retire:#2115
import { pathToFileURL } from 'node:url';
import { runDrainDispatch } from '../src/schedule/drain-dispatch.mjs';

// The surface this path published, named rather than left to the star: a member's
// own local pack may import it, and `export *` says nothing a reader — or the
// consumer-safe-change check — can see.
export {
  runDrainDispatch, dispatchDrain,
} from '../src/schedule/drain-dispatch.mjs';

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runDrainDispatch().catch((e) => { console.error(e.message ?? e); process.exit(1); });
}
