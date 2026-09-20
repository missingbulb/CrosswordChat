// RETIRED PATH, kept as a shim until #2115 for a member whose own workflow or local
// pack still names it. Discovery is the queue's own (`src/contract/task-declaration.mjs`); nothing outside this pack takes it.
// @legacy-tolerance advisory:tasks-retired-public-paths retire:#2115
export {
  findTaskDeclaration, loadTaskDeclaration,
} from '../src/contract/task-declaration.mjs';
