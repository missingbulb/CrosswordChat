// The precondition engine, published for other packs: the signal union a declaration's
// conditions resolve to, the task-local term file, and the one seam that turns a
// discovered task plus its collected signals into a verdict — the same call the
// executor makes at pick.
export {
  preconditionSignals,
} from '../src/contract/precondition-policy.mjs';
export {
  loadTaskTerms, TASK_TERMS_FILE,
} from '../src/contract/task-terms.mjs';
export {
  evaluatePrecondition,
} from '../src/contract/precondition.mjs';
