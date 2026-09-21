// The task declaration's executable contract, published for every pack: the loader
// that turns a `tasks/<name>/task.json` into the declaration the scheduler runs on
// (`normalizeTaskDeclaration`), the validation it is held to, the precondition
// evaluator that runs a declaration the way the executor does at pick, and the
// auto-merge policy engine its `automerge` compiles to — so a pack's own tests
// exercise its declarations against the same rules the machinery applies.
//
// A FACADE over `src/contract/`: these are the machinery's own operations offered
// under a stable name, and what the name promises is the signature, not a
// self-contained implementation.
export {
  normalizeTaskDeclaration, validateTaskDeclaration, canonicalOutcome, opensPullRequest,
  isScheduledTask,
} from '../src/contract/task-contract.mjs';
export { evaluatePrecondition } from '../src/contract/precondition.mjs';
export { loadTaskTerms } from '../src/contract/task-terms.mjs';
export { declaredMergeRules, policyVerdict, policyExpression } from '../src/contract/merge-policy.mjs';
