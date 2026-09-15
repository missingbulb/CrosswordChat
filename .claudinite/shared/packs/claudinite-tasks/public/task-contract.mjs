// Task-declaration validation, published for other packs: the contract a
// `tasks/<name>/task.json` is held to, so a pack's own tests can exercise its task
// declarations against the same rules the scheduler applies — and the evaluator that
// runs a declaration's precondition the way the executor does.
export {
  validateTaskDeclaration, normalizeTaskDeclaration, canonicalOutcome, opensPullRequest,
  isScheduledTask, DEFAULT_AGENT_MODEL,
} from '../src/contract/task-contract.mjs';
export {
  evaluatePrecondition,
} from '../src/contract/precondition.mjs';
