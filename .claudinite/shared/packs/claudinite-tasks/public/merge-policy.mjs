// RETIRED PATH, kept as a shim until #2115 for a member whose own workflow or local
// pack still names it. The policy engine is published through `task-declaration.mjs`; `AUTOMERGE_TRAILER` is in `task-constants.mjs`.
// @legacy-tolerance advisory:tasks-retired-public-paths retire:#2115
export {
  policyVerdict, policyExpression, declaredMergeRules, AUTOMERGE_TRAILER,
} from '../src/contract/merge-policy.mjs';
export {
  diffEntries,
} from '../src/session/merge-policy-run.mjs';
