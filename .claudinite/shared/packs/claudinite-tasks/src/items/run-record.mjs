// The machine-readable records a task's execution leaves in an Actions log,
// and the parsers that read them back.
//
// THE SINGLE HOME OF THE RECORD FORMATS. Every line shape the machinery prints
// about its own work is rendered and parsed here — the two execution families
// below, and the per-run cost record at the foot of the file. A renderer that
// lived apart from its parser is how a format drifts from itself.
//
// TWO FAMILIES, ONE OF THEM HISTORICAL. `claudinite-task-run` was the SLOT
// scheduler's own line, one per due task per run; the slot scheduler is retired
// (#974) and nothing writes that line any more. The parser stays, and only the
// parser: Actions logs from before the retirement are still inside their retention
// window, and the usage fold still counts them. Nothing new should be taught this
// shape — `claudinite-task-exec` below is the live record.
//
// The counts these produce are exact within the Actions log retention window, and
// that is worth stating next to the capture-derived counts they land beside.

import { nowMs } from '../world/clock.mjs';

// The five things a slot scheduler run could do with a due task. One name per
// outcome, used verbatim as the counter key in the aggregate, so there is no
// mapping table between "what the run said" and "what the fold counted" to drift.
export const TASK_RUN_OUTCOMES = Object.freeze([
  // A dispatch issue was filed: an agent session ran this task.
  'agent',
  // The task ran with NO agent — an `agent_model: none` task (code-work is the
  // whole task), or an agentful one whose code-work requested no agent phase.
  // Kebab, not the declaration field's `code_work`: this word is a WIRE token,
  // constrained to the line format's `[a-z-]+` charset.
  'code-work',
  // Due, but its precondition said there was nothing to do.
  'skipped',
  // Its code-work failed; the run converged the task to a needs-human issue.
  'failed',
  // Due and past its precondition, but no NEW agent run started: this slot was
  // already dispatched (exactly-once), an earlier dispatch is still open
  // (at-most-one-open), or another task claimed the run exclusively. Work that
  // was wanted and did not happen this run.
  'deferred',
]);

// An empty per-task counter row — every outcome present, zeros included, so a row's
// shape never depends on which outcomes a task happened to hit.
export const emptyTaskRun = () => Object.fromEntries(TASK_RUN_OUTCOMES.map((o) => [o, 0]));

// The line format. `v1` is the shape's version: a reader that meets a `v2` line
// knows it is looking at something it was not written for, instead of silently
// half-parsing it.
export const TASK_RUN_TAG = 'claudinite-task-run';
const VERSION = 'v1';

// Actions stamps every log line with its own timestamp before the command's output,
// so the parse tolerates that prefix — without it, a fetched log reads as having
// printed nothing at all.
const LINE_RE = new RegExp(
  String.raw`^(?:\S+\s+)?${TASK_RUN_TAG} ${VERSION} (\S+)/(\S+) \[(\S+)\] ([a-z-]+)\s*$`,
);

// One line → `{ pack, task, slotId, outcome }`, or null for anything that is not a
// record of this version. Deliberately strict: an unknown outcome word is NOT a
// record, because counting it would mint a counter key nothing ever reads.
export function parseTaskRun(line) {
  const m = LINE_RE.exec(line);
  if (!m) return null;
  const [, pack, task, slotId, outcome] = m;
  if (!TASK_RUN_OUTCOMES.includes(outcome)) return null;
  return { pack, task, slotId, outcome };
}

// Every record in one job log. The log is the whole job's output — this picks its
// own lines out of it and ignores everything else.
export function parseTaskRuns(text) {
  const out = [];
  for (const line of String(text ?? '').split('\n')) {
    const rec = parseTaskRun(line);
    if (rec) out.push(rec);
  }
  return out;
}

// --- executor-side execution records ------------------------------------------
// The historical records above say what the retired slot scheduler DID with a due
// task; these record what an EXECUTOR SESSION did with the work it ran. Printed by executor-side code
// (resolve-dispatch on a terminal verdict, record-exec.mjs at convergence), they
// land in the session transcript, ride to the conversation-logs branch with the
// executor's capture step, and the usage fold counts them deterministically —
// the "task statuses out of the conversation logs" half of the census (owner,
// 2026-08-06). Same single-home rule: renderer and parser sit here together.

export const TASK_EXEC_STATUSES = Object.freeze([
  // The dispatch ran to completion within its ceiling; the issue was closed.
  'success',
  // The run failed (task failure or ceiling violation); the item parked.
  'failed',
  // The dispatch named a task file the repo no longer carries — retired, its pack
  // undeclared, or the item's stored path left behind by a pack rename — and the
  // executor closed the issue as obsolete. Not a failure.
  'task-gone',
  // The dispatch was malformed (bad path shape, unparseable declaration) and was
  // parked without running.
  'invalid',
]);

export const TASK_EXEC_TAG = 'claudinite-task-exec';

// The bracketed field is the OCCURRENCE'S IDENTITY, which is a different thing under
// each dispatch mechanism: a slot id (`d2026-08-06`) where slots decide what runs, and
// the work item's issue number (`#867`) where the queue does. `slotId` keeps its name
// for the fielded records that already carry one; what it must never become is a
// constant, since it is the only join from a record back to the work it describes.
export const renderTaskExec = ({ pack, task, slotId, status }) =>
  `${TASK_EXEC_TAG} ${VERSION} ${pack}/${task} [${slotId ?? 'unknown'}] ${status}`;

const EXEC_LINE_RE = new RegExp(
  String.raw`(?:^|\s)${TASK_EXEC_TAG} ${VERSION} (\S+)/(\S+) \[(\S+)\] ([a-z-]+)\s*$`,
);

export function parseTaskExec(line) {
  const m = EXEC_LINE_RE.exec(line);
  if (!m) return null;
  const [, pack, task, slotId, status] = m;
  if (!TASK_EXEC_STATUSES.includes(status)) return null;
  return { pack, task, slotId, status };
}

export function parseTaskExecs(text) {
  const out = [];
  for (const line of String(text ?? '').split('\n')) {
    const rec = parseTaskExec(line);
    if (rec) out.push(rec);
  }
  return out;
}

// --- what one run of the machinery cost ----------------------------------------
// The two records above say what happened to a task; this says what the RUN that
// carried it spent — the API calls it made and the wall milliseconds each of its
// phases took. Together with the billed minutes read off the jobs listing, that is
// the whole cost side of the machinery's own usage file
// (packs/claudinite-tasks/tasks/tasks-usage-fold/README.md).
//
// WHERE IT IS READ FROM, and why the shape carries the run id. A scheduler tick
// owns no work item, so its record is only ever in the job log; an executor run
// writes its record onto every item it settles, beside the execution record above,
// because Actions logs expire and the item does not. One run therefore leaves
// SEVERAL copies of its record, each a snapshot of counters that only ever grow —
// so a reader keys on the run id and takes the largest it saw, which is the run's
// total as of its last item.
//
// WHICH MAKES EVERY FIGURE A FLOOR, and deliberately so. A stamp is written DURING
// the convergence it is part of, so an item's own converge time is never in its own
// stamp — it arrives in the next item's, and the last item's is simply never
// counted. The complete reading is the one the run prints into its log at the end.
// Under-counting is one-directional by construction, like every other figure in
// the file these records feed.

export const RUN_COST_TAG = 'claudinite-run-cost';

// The two workflows a record can describe. The same words the usage aggregates
// count runs under, so a record and the row it lands in cannot be spelled apart.
export const RUN_WORKFLOWS = Object.freeze(['scheduler', 'executor']);

// The phases each workflow times, in the order they happen. A phase word is a WIRE
// token like the outcome words above, constrained to the line format's `[a-z-]+`
// charset — `code-work` is the same token the task-run vocabulary already spells.
export const RUN_PHASES = Object.freeze({
  scheduler: Object.freeze(['list', 'ask', 'repair', 'drain']),
  executor: Object.freeze(['pick', 'claim', 'code-work', 'hand-off', 'converge']),
});

// Every phase word, once — the vocabulary a reader expands a record against.
export const ALL_RUN_PHASES = Object.freeze(
  [...new Set([...RUN_PHASES.scheduler, ...RUN_PHASES.executor])],
);

// A phase that did not happen leaves NO key rather than a zero, and an `apiCalls`
// the printer could not read leaves the `calls=` field off entirely: this file's
// whole discipline is that unknown is a state of its own, and a run that never
// reached its hand-off is not a run whose hand-off took no time.
export function renderRunCost({ workflow, runId, apiCalls = null, phaseMs = {} }) {
  const phases = ALL_RUN_PHASES
    .filter((p) => Number.isFinite(phaseMs?.[p]))
    .map((p) => `${p}=${Math.round(phaseMs[p])}`);
  return [
    `${RUN_COST_TAG} ${VERSION} ${workflow} [${runId ?? 'unknown'}]`,
    ...(Number.isFinite(apiCalls) ? [`calls=${apiCalls}`] : []),
    ...phases,
  ].join(' ');
}

// Actions stamps its own timestamp before the command's output, and an executor's
// copy rides inside a fenced block in an issue comment — so the head of the line
// is tolerated exactly as the two parsers above tolerate it.
const COST_LINE_RE = new RegExp(
  String.raw`(?:^|\s)${RUN_COST_TAG} ${VERSION} ([a-z-]+) \[(\S+)\]((?: [a-z-]+=\d+)*)\s*$`,
);

// One line → `{ workflow, runId, apiCalls, phaseMs }`, or null for anything that is
// not a record of this version. An unknown WORKFLOW word rejects the whole line —
// there is no row to count it under. An unknown PHASE word is dropped and the rest
// of the record stands, which is what lets a record printed by a newer engine still
// be read for the phases this one knows.
export function parseRunCost(line) {
  const m = COST_LINE_RE.exec(line);
  if (!m) return null;
  const [, workflow, runId, fields] = m;
  if (!RUN_WORKFLOWS.includes(workflow)) return null;
  let apiCalls = null;
  const phaseMs = {};
  for (const field of fields.trim().split(/\s+/).filter(Boolean)) {
    const [name, value] = field.split('=');
    const n = Number(value);
    if (name === 'calls') apiCalls = n;
    else if (ALL_RUN_PHASES.includes(name)) phaseMs[name] = n;
  }
  return { workflow, runId, apiCalls, phaseMs };
}

export function parseRunCosts(text) {
  const out = [];
  for (const line of String(text ?? '').split('\n')) {
    const rec = parseRunCost(line);
    if (rec) out.push(rec);
  }
  return out;
}

// The accumulator a run times itself with. `phase(name)` opens a phase and returns
// the function that closes it; re-opening a name ADDS to it, because the executor's
// loop passes through pick, claim and converge once per item and the record is the
// run's, not the item's.
//
// The clock comes through the world's port for the same reason every other reading
// of it does; `apiCalls` is a reader the caller supplies rather than an import,
// which keeps the REST paths out of this module. A caller that has no counter to
// offer leaves the field unread, and the record then carries no `calls=`.
export function startRunCost({ workflow, runId = null, apiCalls = () => null, now = nowMs }) {
  const phaseMs = {};
  return {
    phase(name) {
      const from = now();
      return () => { phaseMs[name] = (phaseMs[name] ?? 0) + (now() - from); };
    },
    // The record as it stands NOW — a snapshot, which is exactly what each of the
    // executor's several stamps is. Callers print it; nothing here writes anywhere.
    record() {
      const calls = apiCalls();
      return renderRunCost({ workflow, runId, apiCalls: calls, phaseMs });
    },
  };
}
