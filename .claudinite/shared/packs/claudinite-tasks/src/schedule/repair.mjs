// THE REPAIR PHASE of the scheduler run (docs/PRINCIPLES.md) - the recovery that
// used to run once a day as a task of its own, planned here as ops the same run
// applies before it asks any task whether it wants to run.
//
// IT IS STILL A FALLBACK. Every rule below repairs something that already went
// wrong - a label swap that tore, a session that died, a park nobody answered, a
// terminal nobody closed - and the healthy flow of a task never passes through
// here: an item the machinery handled correctly is settled by whoever handled it,
// before any of this runs. A new rule here is a claim that a failure mode exists
// and that nothing nearer to it can close it out; the alternative to writing one
// is usually fixing the flow that left the mess. What changed when this moved is
// its siting and its latency, not its standing.
//
// AND IT ONLY EVER READS OPEN ITEMS. An item somebody closed is finished, park
// label and all: a person ending a park by closing its issue is an answer, not a
// state to repair, and nothing here reopens, re-labels or re-nags one.
//
// WHY IT RUNS BEFORE THE ASK. Repair frees what the ask then reads: closing an
// abandoned failure park releases the task's lane, and the occurrence the task is
// owed is filed in the same run rather than one tick later. That ordering is the
// whole reason this is a phase of the run and not a task behind it - a task's own
// repair could only ever land after the tick that filed it, and could never feed
// the drain gate that dispatches an executor for what it freed.
//
// The verdicts stay pure in `./repair-rules.mjs`; this module decides
// which op each verdict becomes and which of them may be threaded back into the
// item list the ask reads. The shell in `run.mjs` does the GitHub I/O.

import {
  staleReadyItems, staleReadyComment, deadAgentItems, deadAgentComment,
  statelessItems, statelessComment, supersededItems, supersededComment, taskPathIndex,
  stuckBlockedItems, stuckBlockedComment,
  orphanedParkItems, orphanedParkComment, endedParkItems, endedParkComment,
  abandonedParkItems, abandonedParkComment, unclosedTerminalItems, unclosedTerminalComment,
  periodForTasks, scheduledForTasks,
} from './repair-rules.mjs';
import {
  STATUS_READY, STATUS_RUNNING_AGENT, STATUS_DONE, STATUS_REJECTED,
  STATUS_NEEDS_HUMAN_ACTION, STATUS_NEEDS_HUMAN_FAILURE, IN_REVIEW_LABEL,
} from '../../public/task-constants.mjs';
import {
  statusOf, parseWorkItemTitle, parseWorkItemBody, taskIdFromPath, spellingsOf,
} from '../../public/work-item-grammar.mjs';

// The three ops this phase emits, each a label-and-body mechanic `run.mjs` applies:
//   { kind: 'escalate', issue, from, to, body }        status -> a park, item stays open
//   { kind: 'retire',   issue, from, to, body, close } status -> a terminal, issue closes
//   { kind: 'close-terminal', issue, body, close }     the close a torn transition never made
//   { kind: 'note', issue, body }                      a comment and nothing else
//
// `confirm` names the pure predicate the shell must see hold on a FRESH read before
// it writes. Only the three rules whose premise is a TRANSIENT carry one - "this
// looks torn", "nobody has touched this" - because a swap in flight is
// indistinguishable from one that tore and `items` is a snapshot seconds old (#1104:
// #1101 closed `task:done` at 12:50:13Z and was escalated at 12:50:21Z). The rules
// that turn on a clock over a stable label need no second read.
//
// `clearInReview` is the one write that lands on a DIFFERENT issue than the one the
// rule judged (a legacy shadow item's request issue, below).

// Whether the ask may see this op's effect in the same run. An op the shell might
// decline on its fresh read must NOT be threaded: the plan would then hand the ask
// a world the run never wrote. Declining to thread costs at most one tick of lag on
// a rule that is already measured in hours or days, which is the safe direction.
const threadable = (op) => !op.confirm;

// Apply an op's effect to the in-memory item, mirroring exactly what the shell
// writes - status cleared of EVERY spelling, the new label added, and for a retire
// the close itself. The cadence terms read these items (`signals/index.mjs` folds
// `ctx.items` into each task's run history), so an effect that is written to GitHub
// but not to the snapshot leaves the ask judging a world one write out of date.
function threadEffect(item, op) {
  if (op.from) {
    const gone = new Set(spellingsOf(op.from));
    item.labels = item.labels.filter((l) => !gone.has(l));
  }
  if (op.to && !item.labels.includes(op.to)) item.labels.push(op.to);
  if (op.kind === 'retire') {
    item.state = 'closed';
    item.closed_at = op.at;
  }
}

// The whole phase. `open` is the open half of `items`; every lookup a rule needs
// that is not a label is injected, so the rules stay pure and the reads stay the
// shell's:
//   progressAt(item)   the newest progress comment on an item holding an agent
//   resolutionOf(n)    'merged' | 'closed' | null for a park's `Ends-when:` target
//   doneAfter(id, at)  the task's newest clean run closed after `at`, or null
//   isRequest(number)  true where job 4 owns this issue (below)
//   stateOf(n)         the state of a `Blocked-by` target, which need not be an item
export function planRepair({
  items = [], tasks = [], now, progressAt = () => null, resolutionOf = () => null,
  doneAfter = () => null, isRequest = () => false, stateOf = () => null,
}) {
  const open = items.filter((i) => i.state === 'open');
  const ops = [];
  const taken = new Set();
  const claim = (item) => { if (taken.has(item.number)) return false; taken.add(item.number); return true; };

  // --- the closing rules, in their precedence order -------------------------
  // Naming the run that answered a park says more than naming the absence of a
  // task file, which says more than the clock running out on it.
  for (const item of supersededItems(open, { doneAfter })) {
    if (!claim(item)) continue;
    const p = parseWorkItemTitle(item.title) ?? taskIdFromPath(parseWorkItemBody(item.body).taskPath);
    const run = doneAfter(`${p.pack}/${p.task}`, item.updated_at ?? item.created_at);
    ops.push({
      kind: 'retire', rule: 'superseded', issue: item.number, from: statusOf(item), to: STATUS_REJECTED,
      close: 'not_planned', at: now, body: supersededComment(run),
    });
  }

  const headPath = taskPathIndex(tasks);
  for (const item of orphanedParkItems(open, { tasks })) {
    if (!claim(item)) continue;
    const p = parseWorkItemTitle(item.title) ?? taskIdFromPath(parseWorkItemBody(item.body).taskPath);
    const id = `${p.pack}/${p.task}`;
    ops.push({
      kind: 'retire', rule: 'orphaned', issue: item.number, from: statusOf(item), to: STATUS_REJECTED,
      close: 'not_planned', at: now, body: orphanedParkComment(id, headPath.get(id) ?? null),
    });
  }

  // THE RESOLUTION DECIDES THE OUTCOME; BOTH OUTCOMES CLOSE. A merged target means
  // the work landed and an unmerged one that it was rejected - and a person who
  // closed the pull request has already given their answer, so leaving their issue
  // open asks them to come back and say it a second time.
  for (const item of endedParkItems(open, { resolutionOf })) {
    if (!claim(item)) continue;
    const { endsWhen, request } = parseWorkItemBody(item.body);
    const resolution = resolutionOf(endsWhen);
    ops.push({
      kind: 'retire', rule: 'ended', issue: item.number, from: statusOf(item),
      to: resolution === 'merged' ? STATUS_DONE : STATUS_REJECTED,
      close: resolution === 'merged' ? 'completed' : 'not_planned',
      at: now, body: endedParkComment(endsWhen, resolution),
      // A LEGACY SHADOW ITEM told its request issue it was in review; nothing else
      // would ever take that back, and the review is over.
      clearInReview: request && request !== item.number ? { issue: request, label: IN_REVIEW_LABEL } : null,
    });
  }

  for (const item of abandonedParkItems(open, now, { scheduledFor: scheduledForTasks(tasks) })) {
    if (!claim(item)) continue;
    ops.push({
      kind: 'retire', rule: 'abandoned', issue: item.number, from: statusOf(item), to: STATUS_REJECTED,
      close: 'not_planned', at: now, body: abandonedParkComment(), confirm: 'abandoned',
    });
  }

  // The close a torn transition never made. It writes no label: the status is
  // already the right one, and the outcome comes from it.
  for (const item of unclosedTerminalItems(open, now)) {
    if (!claim(item)) continue;
    const status = statusOf(item);
    ops.push({
      kind: 'close-terminal', rule: 'unclosed', issue: item.number,
      close: status === STATUS_DONE ? 'completed' : 'not_planned',
      body: unclosedTerminalComment(status), confirm: 'unclosed',
    });
  }

  // --- the escalations ------------------------------------------------------
  for (const item of staleReadyItems(open, now, { periodFor: periodForTasks(tasks) })) {
    if (!claim(item)) continue;
    ops.push({
      kind: 'escalate', rule: 'stale-ready', issue: item.number, from: STATUS_READY,
      to: STATUS_NEEDS_HUMAN_ACTION, body: staleReadyComment(item),
    });
  }

  // FAILURE, not decision: a dead session is something the machine noticed, never a
  // choice a person made. The kind carries two consequences that both want that
  // reading - it is the only park a later clean run can supersede, and the only one
  // that holds the task's lane, so the generator stops filing a fresh occurrence
  // each anchor behind a run nobody has looked at.
  for (const item of deadAgentItems(open, now, { progressAt })) {
    if (!claim(item)) continue;
    ops.push({
      kind: 'escalate', rule: 'dead-agent', issue: item.number, from: STATUS_RUNNING_AGENT,
      // The body is the shell's: only it can read the hand-off comment that names
      // WHICH session died, and an escalation that cannot name one says less rather
      // than asserting something it does not know.
      to: STATUS_NEEDS_HUMAN_FAILURE, body: null, note: 'dead-agent',
      wedged: progressAt(item) != null,
    });
  }

  // COMMENT ONLY, deliberately: labels untouched means the item still proceeds by
  // itself the moment its blockers resolve, and a human who decides it is dead
  // closes it by hand. It claims nothing, so an item this rule notes can still be
  // escalated or closed by a rule above - the note is about the wait, not the item's
  // state.
  for (const item of stuckBlockedItems(open, now, { stateOf })) {
    if (taken.has(item.number)) continue;
    const unresolved = parseWorkItemBody(item.body).blockedBy.filter((n) => stateOf(n) !== 'closed');
    ops.push({ kind: 'note', rule: 'stuck-dependency', issue: item.number, body: stuckBlockedComment(item, unresolved) });
  }

  // A TORN ADOPTION IS NOT A TORN ITEM. Adoption writes the machine block and then
  // the status (`run.mjs` job 4), so a block with no status is the shape a failed
  // label call leaves - and it is exactly what job 4 re-adopts on the next run. It
  // reaches this rule looking identical to a swap that tore, so the issues job 4
  // owns are excluded here rather than parked out from under it.
  for (const item of statelessItems(open)) {
    if (isRequest(item.number)) continue;
    if (!claim(item)) continue;
    ops.push({
      kind: 'escalate', rule: 'stateless', issue: item.number, from: null,
      to: STATUS_NEEDS_HUMAN_FAILURE, body: statelessComment(), confirm: 'stateless',
    });
  }

  // --- legacy cleanup -------------------------------------------------------
  // THE HOME FOR A RETIRED MECHANISM'S LEFTOVERS, deliberately kept as a named
  // place rather than a module: a rule here reads the items this phase has already
  // listed and costs no read of its own, which is the whole reason such a rule
  // belongs in this pass rather than in a sweep of its own.
  //
  // What lived here until the merge: the slot scheduler's `[claudinite-task]`
  // dispatch issues (#974), escalated when stale, re-armed when their trigger event
  // was lost. All three of its rules went when the task did. The re-arm and the
  // dead-claim were already no-ops - re-emitting a ready label for a trigger nothing
  // listens to arms nothing, and no session claims a dispatch issue any more - and
  // the escalation's population is a closed set that only shrinks. A member still
  // holding one closes it by hand, which is one issue, once.
  //
  // A future rule here states which retired mechanism it cleans up after and what
  // bounds its population, so the next reader can tell a live rule from one whose
  // world is gone.

  // Thread what the shell is certain to write, so the ask judges this run's world.
  const byNumber = new Map(items.map((i) => [i.number, i]));
  const closed = new Set();
  for (const op of ops) {
    if (!threadable(op)) continue;
    const item = byNumber.get(op.issue);
    if (item) threadEffect(item, op);
    if (op.kind === 'retire') closed.add(op.issue);
  }
  return { ops, closed };
}
