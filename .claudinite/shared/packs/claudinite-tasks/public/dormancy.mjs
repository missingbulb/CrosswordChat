// RETIRED PATH, kept as a shim until #2115 for a member whose own workflow or local
// pack still names it. The dashboard and the fleet sheepdog keep their own copies of the predicate; the queue's is `src/contract/dormancy.mjs`.
// @legacy-tolerance advisory:tasks-retired-public-paths retire:#2115
export { isDormant, dormancyErrors, TASKS_PACK_ID } from '../src/contract/dormancy.mjs';
