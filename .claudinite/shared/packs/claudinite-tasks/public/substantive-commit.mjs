// RETIRED PATH, kept as a shim until #2115 for a member whose own workflow or local
// pack still names it. The dashboard keeps its own copy of the test; the queue's is `src/signals/substantive-commit.mjs`.
// @legacy-tolerance advisory:tasks-retired-public-paths retire:#2115
export { isSubstantiveCommit, HOUSEKEEPING } from '../src/signals/substantive-commit.mjs';
