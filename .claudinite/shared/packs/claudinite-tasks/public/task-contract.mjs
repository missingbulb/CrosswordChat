// RETIRED PATH, kept as a shim until #2115 for a member whose own workflow or local
// pack still names it. The contract is published through `task-declaration.mjs`; `DEFAULT_AGENT_MODEL` is in `task-constants.mjs`.
// @legacy-tolerance advisory:tasks-retired-public-paths retire:#2115
export {
  validateTaskDeclaration, normalizeTaskDeclaration, canonicalOutcome, opensPullRequest,
  isScheduledTask, DEFAULT_AGENT_MODEL,
} from '../src/contract/task-contract.mjs';
export {
  evaluatePrecondition,
} from '../src/contract/precondition.mjs';
