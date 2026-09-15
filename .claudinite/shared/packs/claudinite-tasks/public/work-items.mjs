// The work-item vocabulary, published for other packs: the title grammar that IS a
// work item's identity, the outcome/status decode over its labels (every legacy
// spelling included), lease state, and the pick order over the open queue.
// Re-exported rather than reimplemented so a consumer and the queue can never disagree
// about what a title means.
//
// `isDispatchTitle` rides here for the same reason: a consumer listing a repo's issues
// has to tell the scheduler's own dispatch issues from the work, and one that decided
// that by its own regex would count the machinery as a member's activity.
//
// NAMED, not `export *`: what this file lists IS the promise, so a reader sees the
// whole of it here and an internal rename cannot quietly widen or narrow it. The
// queue's own GitHub listings are deliberately absent — reading the queue is this
// pack's work, and a consumer wanting queue state renders what it was given.
export {
  WORK_PREFIX, ORIGIN_AD_HOC, ASKED_FOR_ORIGINS, QUEUE_LABELS, READY, URGENT, BLOCKED,
  EXECUTING, AGENT, NEEDS_HUMAN, TASK_DONE, STATUS_READY, STATUS_BLOCKED,
  STATUS_RUNNING_EXECUTOR, STATUS_RUNNING_AGENT, STATUS_NEEDS_HUMAN_APPROVAL,
  STATUS_NEEDS_HUMAN_FAILURE, NEEDS_HUMAN_ACTION, NEEDS_HUMAN_APPROVAL,
  NEEDS_HUMAN_DECISION, NEEDS_HUMAN_FAILURE, PARK_KINDS, PARK_PREFIX, PARK_STATUSES,
  OUTCOME_DONE, OUTCOME_DELIVERED, OUTCOME_OBSOLETE, CLAIM_MARKER, HANDOFF_MARKER,
  EPISODE_MARKER, MACHINE_BLOCK_START, MACHINE_BLOCK_END, parseWorkItemTitle,
  parseWorkItemBody, parseRequestFields, parseLastVerdict, machineBlockOf,
  withMachineBlock, taskIdFromPath, labelNames, hasLabel, statusOf, statusesOn,
  spellingsOf, outcomeOf, isQueueItem, isParked, isBlockingPark, parkKindOf,
  triageLabelFor,
} from '../src/items/work-item.mjs';
export {
  EXECUTING_LEASH_MS, AGENT_LEASH_MS, STALE_READY_PERIODS, STUCK_BLOCKED_MS,
} from '../src/items/leases.mjs';
export {
  pickOrder,
} from '../src/items/pick-order.mjs';
export {
  NEEDS_HUMAN_LABEL, isDispatchTitle,
} from '../src/session/dispatch.mjs';
