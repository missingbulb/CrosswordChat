// RETIRED PATH, kept as a shim until #2115 for a member whose own workflow or local
// pack still names it. `evaluatePrecondition` and `loadTaskTerms` are published through `task-declaration.mjs`.
// @legacy-tolerance advisory:tasks-retired-public-paths retire:#2115
export {
  preconditionSignals, evaluatePreconditions, MAX_CONTEXT_ITEMS,
} from '../src/contract/precondition-policy.mjs';
export {
  loadTaskTerms, TASK_TERMS_FILE,
} from '../src/contract/task-terms.mjs';
export {
  evaluatePrecondition,
} from '../src/contract/precondition.mjs';
