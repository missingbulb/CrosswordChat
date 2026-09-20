// RETIRED PATH, kept as a shim until #2115 for a member whose own workflow or local
// pack still names it. The signal shapes are the queue's own (`src/signals/`); nothing outside this pack takes them.
// @legacy-tolerance advisory:tasks-retired-public-paths retire:#2115
export * from '../src/signals/index.mjs';
export { localSignalContext } from '../src/world/git.mjs';
