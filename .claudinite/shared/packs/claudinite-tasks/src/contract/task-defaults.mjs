// THE DEFAULTS, and the one place a declaration's absent field becomes a value
// (owner, 2026-09-03):
//   - `automerge`: land nothing unreviewed — `'nothing'`, for a task that may open a PR
//     (every outcome but `no_code_changes`).
//   - `agent_model`: no agent — `'none'`.
// An absent `code_work` or `agent_instructions` stays absent and means none.
// Neither timeout has a default, deliberately: an agent or a code-work
// subprocess always carries its own time limit, so the field is required
// wherever the phase it bounds is declared. `preconditions` and `expected_outcome`
// have no default either — each is a choice the author makes: the expression is
// the whole of when the task runs, and an absent one has not said.
import { DEFAULT_AUTOMERGE, DEFAULT_AGENT_MODEL } from '../../public/task-constants.mjs';

export { DEFAULT_AUTOMERGE, DEFAULT_AGENT_MODEL };

export function applyTaskDefaults(out) {
  if (out.agent_model === undefined) out.agent_model = DEFAULT_AGENT_MODEL;
  if (out.expected_outcome !== undefined && out.expected_outcome !== 'no_code_changes' && out.automerge === undefined) out.automerge = DEFAULT_AUTOMERGE;
  return out;
}
