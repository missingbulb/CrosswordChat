// RETIRED PATH, kept as a shim until #2115 for a member whose own workflow or local
// pack still names it. The dashboard keeps its own copy of the closing-issue parse; the queue's is `src/items/pr-fields.mjs`.
// @legacy-tolerance advisory:tasks-retired-public-paths retire:#2115
export { closesIssueIn, hoursBetween } from '../src/items/pr-fields.mjs';
