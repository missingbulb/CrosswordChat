// RETIRED PATH, kept as a shim until #2115 for a member whose own workflow or local
// pack still names it. The spec format is the probe worker's own (`tasks/verify-production/probes.mjs`); nothing outside this pack takes it.
// @legacy-tolerance advisory:tasks-retired-public-paths retire:#2115
export { parseVerificationSpec, parseRetryEvery, RETRY_FIELD } from '../tasks/verify-production/probes.mjs';
