// The add-packs ISSUE PROTOCOL — the contract between the fleet manager's
// fleet/fleet-add-missing-packs task (`cn fleet add-packs`, the engine's — WRITES
// work-list issues into members) and each member's own adopt-requested-packs task
// (READS its own repo's and adopts).
//
// TWO COPIES, ONE SHAPE. A pack imports nothing from the engine's fleet code, so the
// member-side task carries its own copy of the shape `cn fleet protocol` prints.
// Change one and change the other.
//
// The protocol is deliberately tiny: two converged issue titles, and the
// one body element that is DATA rather than prose — the fenced JSON block whose
// array is the declaration entries to write. Everything else in an issue body is
// for the human and the agent to read, not to parse.

// Exactly one converged issue per kind per member — the title IS the convergence key.
//
//   REQUESTED — an owner named these packs, with config and interview answers, on a
//   forced fleet run. Not a suspicion: the member's agent adopts what the JSON block
//   says, verbatim, and never re-litigates whether it was wanted.
//
//   SUSPECTED — the weekly fleet scan fingerprinted the member's shape against packs
//   its declaration does not carry. A suspicion, not a verdict: the member's agent
//   confirms each pack against the checkout before declaring it, declines with a
//   reason, and a `not planned` close is a standing answer the scan honours.
export const REQUESTED_TITLE = 'Add packs: requested for this repo';
export const SUSPECTED_TITLE = 'Add packs: suspected from this repo’s shape';

// The declaration entries a REQUESTED issue carries, read back out of its body. The
// body renders them as a fenced JSON array precisely so this is a parse and not a
// guess; a body whose block cannot be read yields null, and every caller treats null
// as "leave it for a human" — never as an empty request.
export function entriesIn(body) {
  const m = /```json\n([\s\S]*?)\n```/.exec(String(body ?? ''));
  if (!m) return null;
  try {
    const entries = JSON.parse(m[1]);
    if (!Array.isArray(entries)) return null;
    const ids = entries.filter((e) => typeof e?.id === 'string');
    return ids.length ? entries : null;
  } catch { return null; }
}

// THE WORK LIST IS A MARKED ISSUE. The
// enforcer marks each work-list issue `task:origin:ad-hoc` and names the member
// task in the body's `Task:` field, so the member's ordinary hourly scheduler run
// adopts it: the issue becomes the work item, and the run that drains it plays out
// on the issue itself. That retires the old fan-out's second half — a
// `wake: <task>` dispatch into every member — leaving the dispatch as latency
// sugar rather than the delivery.
export const MARK = 'task:origin:ad-hoc';
export const MEMBER_TASK_ID = 'claudinite-lifecycle/adopt-requested-packs';

// The fields that make a work-list body a request: which task drains it, and what
// it waits on. `blockedBy` is the member's OTHER open work list where there is one
// — two lists in one member are two items of one task, which nothing else
// serializes (their titles differ, so the same-title mutex does not see them), and
// two sessions editing one declaration at once is two conflicting pull requests.
export function withTargeting(body, { blockedBy = null } = {}) {
  const fields = [`Task: ${MEMBER_TASK_ID}`];
  if (blockedBy) fields.push(`Blocked-by: #${blockedBy}`);
  return `${fields.join('\n')}\n\n${String(body ?? '').replace(/^\s+/, '')}`;
}
