// RETIRED PATH, kept as a shim until #2115 for a member whose own workflow or local
// pack still names it. `planWake` is the scheduler run's own (`src/schedule/run.mjs`); nothing outside this pack takes it.
// @legacy-tolerance advisory:tasks-retired-public-paths retire:#2115
export { planWake } from '../src/schedule/run.mjs';
