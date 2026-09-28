// The task vocabulary — every value the queue writes and reads, as one definition
// that imports nothing: the work item's labels, markers and body fields, the
// leases, the commit trailers, the declaration defaults and the pack's own
// parameters. `src/` imports these from here, and so does every other pack and every
// member's own local pack: a value here is a promise across engine versions, which is
// why additive change is the strongly preferred shape and a rename needs a migration.
//
// Values only. The decode and encode over them — the title grammar, the status decode
// over an item's labels, the body fields' parse and serialize - live in the work-item
// grammar beside this file.

// The title prefix. Disjoint from the slot mechanism's `[claudinite-task]` on
// purpose: the two mechanisms coexist per-repo behind `taskScheduler.dispatch`,
// and neither may read the other's issues (PRINCIPLES.md, S29).
export const WORK_PREFIX = '[claudinite-work]';

// --- the canonical vocabulary (PRINCIPLES.md, the migration of #1119) -------------
// Every label the machinery writes is one of three things — the item's single
// STATUS, its lifelong ORIGIN, or the URGENCY flag — and all of them live in the
// `task:` namespace. These are the spellings a reader compares against: decode
// first (`statusOf`, `originOf`), then compare, so an item filed by any engine
// version answers the same question the same way.
export const STATUS_PREFIX = 'task:status:';
export const PARK_PREFIX = `${STATUS_PREFIX}needs-human-`;

export const STATUS_BLOCKED = `${STATUS_PREFIX}blocked`;
export const STATUS_READY = `${STATUS_PREFIX}waiting-for-executor`;
export const STATUS_RUNNING_EXECUTOR = `${STATUS_PREFIX}running-executor`;
export const STATUS_RUNNING_AGENT = `${STATUS_PREFIX}running-agent`;
export const STATUS_NEEDS_HUMAN_ACTION = `${PARK_PREFIX}action`;
export const STATUS_NEEDS_HUMAN_DECISION = `${PARK_PREFIX}decision`;
export const STATUS_NEEDS_HUMAN_APPROVAL = `${PARK_PREFIX}approval`;
export const STATUS_NEEDS_HUMAN_FAILURE = `${PARK_PREFIX}failure`;
export const STATUS_DONE = `${STATUS_PREFIX}done`;
export const STATUS_REJECTED = `${STATUS_PREFIX}rejected`;

// The four statuses an OPEN item may wear before it parks or converges. An open
// item wearing no decodable status at all is off the state machine — a torn label
// swap's leavings, which the janitor repairs (docs/PRINCIPLES.md).
export const LIVE_STATUSES = Object.freeze([
  STATUS_BLOCKED, STATUS_READY, STATUS_RUNNING_EXECUTOR, STATUS_RUNNING_AGENT,
]);
// THE PARK KINDS. A park is ONE label - `task:status:needs-human-<kind>`
// — and the kind is what the human is being asked for, which is the whole
// difference between a queue a person can skim and one they have to read.
//
// The four are disjoint by REMEDY, not by cause:
//   action   — something outside the code must change: a secret set, a scope
//              granted, a routine's prompt or endpoint fixed, an item re-created
//              with the parameter it was missing. Mechanical; no judgement.
//   decision — the run stopped mid-flight and what happens next is a choice:
//              re-queue or abandon, does the half-done work stand, was the
//              ceiling violation acceptable.
//   approval — the run SUCCEEDED and deliberately left an unmerged PR. The only
//              park that is not a fault; the human merges it or closes it.
//   failure  — the run broke: a bug, a contract-forbidden shape, a malformed or
//              forged item. Someone diagnoses and fixes code.
// `failure` is the default a park falls back to, so an unclassified park reads as
// "diagnose me" rather than quietly joining the mechanical lane.
// Ordered as a decoder prefers them when an item somehow wears more than one:
// `failure` first, the conservative lane. The two-label era's sub-labels
// (`task:needs-human-<kind>`) are read by the grammar's `parkOf` and written by nobody.
export const PARK_KINDS = Object.freeze(['failure', 'action', 'decision', 'approval']);
export const PARK_STATUSES = Object.freeze(PARK_KINDS.map((k) => `${PARK_PREFIX}${k}`));
export const STATUS_LABELS = Object.freeze([
  ...LIVE_STATUSES, ...PARK_STATUSES, STATUS_DONE, STATUS_REJECTED,
]);

// THE ORIGIN (docs/PRINCIPLES.md) — who asked for this item, worn for the
// item's whole life beside whatever status it holds.
export const ORIGIN_PREFIX = 'task:origin:';
export const ORIGIN_PLANNED = `${ORIGIN_PREFIX}planned`;
// The two shapes a person's ask takes. `manual` is an occurrence of a DECLARED
// task somebody pulled the lever on — a wake, a hand-created item — so the queue
// already knows what work it is. `ad-hoc` is somebody's own issue, adopted as
// itself, which every time runs the same task (`implement-request`) over a
// different subject.
export const ORIGIN_MANUAL = `${ORIGIN_PREFIX}manual`;
export const ORIGIN_AD_HOC = `${ORIGIN_PREFIX}ad-hoc`;
export const ORIGIN_GITHUB = `${ORIGIN_PREFIX}github`;
export const ORIGIN_LABELS = Object.freeze([ORIGIN_PLANNED, ORIGIN_MANUAL, ORIGIN_AD_HOC, ORIGIN_GITHUB]);
// Every origin that is somebody asking. The scheduler files only ORIGIN_PLANNED,
// so this is its complement among the origins a person's action produces.
export const ASKED_FOR_ORIGINS = Object.freeze([ORIGIN_MANUAL, ORIGIN_AD_HOC]);

export const URGENT = 'task:urgent';

// --- the legacy spellings, written never and read forever ----------------------
// Every spelling any fielded engine has written. They are literals rather than
// aliases of the constants above precisely because those constants moved: a decode
// map built from them would have mapped today's spelling to itself and forgotten
// the vocabulary it exists to read (PRINCIPLES.md).
// @legacy-tolerance advisory:none retire:#1642
export const LEGACY_BLOCKED = 'task:blocked';
// @legacy-tolerance advisory:none retire:#1642
export const LEGACY_READY = 'task:ready';
// @legacy-tolerance advisory:none retire:#1642
export const LEGACY_EXECUTING = 'task:executing';
// @legacy-tolerance advisory:none retire:#1642
export const LEGACY_AGENT = 'task:agent';

// @deprecated The bare park of the two-label era. A park is ONE label now
// (`task:status:needs-human-<kind>`); this is still read — on its own it decodes to
// `failure`, the conservative lane — and still ensured, because an open item filed
// by a fielded engine wears it. Its one live writer is the session-side dispatch
// flow, which labels an anomaly with it for triage (`src/session/dispatch.mjs`).
export const NEEDS_HUMAN = 'needs-human';

// @deprecated Nothing writes this since the approval park: a run that left an
// unmerged PR no longer CLOSES as delivered, it parks at the approval lane and
// waits to be merged. Kept exported, kept in `QUEUE_LABELS`, and still read
// everywhere it was read — closed issues carrying it are stored data, and a decoder
// that stopped recognising it would turn every historical delivered run into an
// un-outcomed one.
export const OUTCOME_DELIVERED = 'outcome:delivered';

// @deprecated The pre-2026-08-19 terminal spellings. Kept exported so a fielded
// pack that imports them still loads, and READ wherever an outcome is decoded:
// labels are stored data on closed issues fleet-wide, so a decoder that stopped
// recognising these would turn every historical run into an un-outcomed one.
export const OUTCOME_DONE = 'outcome:done';
export const OUTCOME_OBSOLETE = 'outcome:obsolete';

// @deprecated The pre-#1119 terminal spellings in the `task:` namespace, the
// generation between `outcome:*` and today's statuses. Read forever, same reason.
// @legacy-tolerance advisory:none retire:#1642
export const LEGACY_TASK_DONE = 'task:done';
// @legacy-tolerance advisory:none retire:#1642
export const LEGACY_TASK_OBSOLETE = 'task:obsolete';

// @deprecated The origin marker (PRINCIPLES.md). Nothing writes it and nothing
// branches on it: whether an item is a task's standing occurrence or an ad-hoc run
// is STRUCTURAL — see `isStandingItem` — so a marker that could disagree with the
// structure was a second authority over the same fact. Kept exported and inert
// because open items filed by an older engine still carry it, and a reader that
// choked on an unknown label would fail on exactly those.
export const ORIGIN_SCHEDULE = 'origin:schedule';

// THE RE-QUEUE LEVER, in words — one home, because it is written into every message
// that parks an item and a stale copy of it is an instruction that no longer works.
// Clearing the status IS the re-ask (PRINCIPLES.md): a park is one label now, so
// there is nothing else to take off.
export const requeueHint = `clear its status label and add \`${STATUS_READY}\``;

// --- the request vocabulary, retired (docs/PRINCIPLES.md's legacy table) --------
// @deprecated The three labels the SHADOW-ITEM request model used. The mark is
// `task:origin:ad-hoc` now and the marked issue is the item itself, so nothing here
// applies these — but they are read forever: `claude-task` is still accepted as a
// mark (a person with it in muscle memory, a template that carries it), and an
// issue whose shadow item is still draining wears `claude-queued`.
//
// What survives the retirement is the reason the mark is a LABEL at all: it must be
// appliable from the issue page on a phone, and it is write-gated by the platform —
// applying a label needs triage or write access — which is the first half of the
// security story (the second is the precondition's permission read at pickup,
// PRINCIPLES.md). A request's PARAMETERS are body fields (`parseRequestFields`), gated on
// the author's push access instead, and no label carries one: a `claude-model:` or
// `claude-automerge` label applied by hand asks for nothing.
export const REQUEST_LABEL = 'claude-task';
export const QUEUED_LABEL = 'claude-queued';
export const IN_REVIEW_LABEL = 'claude-in-review';

// The families a request may ask for in its `Model:` field. `none` is not among
// them: a request is implemented by a session, so an agentless family would name a
// run that cannot happen.
export const REQUEST_MODELS = Object.freeze(['opus', 'sonnet', 'haiku']);

// Every label this mechanism applies, with the colour and description a bootstrap
// one-off would have given it. Ensured create-if-missing before anything is
// applied: GitHub 422s when you apply an unknown label and never creates one on
// demand, so the thing that assigns a label guarantees it first.
//
// The LEGACY block below is ensured too, and that is deliberate: nothing writes
// those spellings any more, but open items filed by a fielded engine wear them and
// deleting a label strips it from every issue that carries it — including closed
// ones, which are stored data (PRINCIPLES.md).
export const QUEUE_LABELS = [
  { name: STATUS_BLOCKED, color: 'c5def5', description: 'Claudinite queue: waiting on Blocked-by and/or Not-before' },
  { name: STATUS_READY, color: '0e8a16', description: 'Claudinite queue: available for an executor to pick up' },
  { name: URGENT, color: 'd93f0b', description: 'Claudinite queue: pick this before any non-urgent item' },
  { name: STATUS_RUNNING_EXECUTOR, color: 'fbca04', description: 'Claudinite queue: an executor holds the claim' },
  { name: STATUS_RUNNING_AGENT, color: '1d76db', description: 'Claudinite queue: an agent session owns this item' },
  { name: STATUS_NEEDS_HUMAN_ACTION, color: 'b60205', description: 'Claudinite queue: parked — a human must change something outside the code' },
  { name: STATUS_NEEDS_HUMAN_DECISION, color: 'd93f0b', description: 'Claudinite queue: parked — a human must choose what happens next' },
  { name: STATUS_NEEDS_HUMAN_APPROVAL, color: '5319e7', description: 'Claudinite queue: parked — succeeded and left an unmerged PR to approve' },
  { name: STATUS_NEEDS_HUMAN_FAILURE, color: 'b60205', description: 'Claudinite queue: parked — the run broke, diagnose and fix' },
  { name: STATUS_DONE, color: '0e8a16', description: 'Claudinite queue: succeeded, nothing pending' },
  { name: STATUS_REJECTED, color: 'ededed', description: 'Claudinite queue: never ran — the precondition said no, or the task is gone' },
  { name: ORIGIN_PLANNED, color: 'c2e0c6', description: 'Claudinite queue: filed by the schedule — a task\'s own occurrence' },
  { name: ORIGIN_MANUAL, color: 'bfd4f2', description: 'Claudinite queue: pulled by a person — an occurrence of a declared task, woken or hand-created' },
  { name: ORIGIN_AD_HOC, color: 'bfd4f2', description: 'Claudinite queue: asked for by a person — their own issue, adopted as the work item itself' },
  { name: ORIGIN_GITHUB, color: 'd4c5f9', description: 'Claudinite queue: filed by the platform itself — a workflow reporting its own failure' },
  // Legacy, kept alive for the items that wear them.
  { name: LEGACY_BLOCKED, color: 'c5def5', description: 'Claudinite queue (legacy): waiting on Blocked-by and/or Not-before' },
  { name: LEGACY_READY, color: '0e8a16', description: 'Claudinite queue (legacy): available for an executor to pick up' },
  { name: LEGACY_EXECUTING, color: 'fbca04', description: 'Claudinite queue (legacy): an executor holds the claim' },
  { name: LEGACY_AGENT, color: '1d76db', description: 'Claudinite queue (legacy): an agent session owns this item' },
  { name: NEEDS_HUMAN, color: 'b60205', description: 'Claudinite queue (legacy): parked for a human' },
  { name: LEGACY_TASK_DONE, color: '0e8a16', description: 'Claudinite queue (legacy): succeeded, nothing pending' },
  { name: LEGACY_TASK_OBSOLETE, color: 'ededed', description: 'Claudinite queue (legacy): never ran' },
  { name: OUTCOME_DELIVERED, color: '5319e7', description: 'Claudinite queue (legacy): succeeded and left a live artifact the world still has to act on' },
];

// --- comment markers ----------------------------------------------------------
// The three comments the protocol reads back. They are HTML comments so a human
// reading the item sees prose, and they are here — with the labels and the body
// fields — because together they ARE the item's vocabulary, the one compatibility
// surface across engine versions (PRINCIPLES.md).
//
// The CLAIM comment carries who and when (executor identity is an unbounded set
// and must never become a label). The HANDOFF comment names the session and the
// invocation nonce. The EPISODE comment is the boundary the claim arbiter is
// scoped to: every claim before it is dead, and arbitrating over dead claims makes
// one outrank every future live claimant — the item then livelocks through reclaim
// cycles forever (F18). A reclaim, a revert and a hand re-queue each write one.
export const CLAIM_MARKER = '<!-- claudinite-claim -->';
export const HANDOFF_MARKER = '<!-- claudinite-handoff -->';
export const EPISODE_MARKER = '<!-- claudinite-episode -->';

// --- the body -----------------------------------------------------------------

export const NOT_BEFORE_FIELD = 'Not-before';
export const BLOCKED_BY_FIELD = 'Blocked-by';

// `Ends-when` is a PARK'S END CONDITION (#1468) — the one field a park carries that
// says what would make it stop being a question. `#<n> closed` is its only grammar,
// and its target is whatever the park is waiting on: an approval park's pull
// request, an action park's setup issue. Nothing else is recognised, so a hand-written
// condition the janitor cannot evaluate reads as absent rather than as satisfied.
//
// It is NOT `Blocked-by`, which governs the ready/blocked lane and releases an item
// to run again; this one ENDS an item that already ran.
export const ENDS_WHEN_FIELD = 'Ends-when';
export const ENDS_WHEN_CLOSED = 'closed';

// THE TARGET (PRINCIPLES.md) — which branch and pull request this run works on,
// decided by the executor once the precondition said go and stamped here at the
// hand-off, so the agent reads it where it reads everything else and never picks a
// branch of its own. `Target-pr` is present only when the run AMENDS an open pull
// request; `Supersedes` names the task's earlier pull requests a
// `supersede_existing_pr` run closes once its own exists — read back by the
// session's converge, which performs those closes.
export const TARGET_BRANCH_FIELD = 'Target-branch';
export const TARGET_PR_FIELD = 'Target-pr';
export const SUPERSEDES_FIELD = 'Supersedes';

// WOKEN (docs/PRINCIPLES.md) — the instant somebody created this item by hand or woke
// it: a hand-created item, a forced mint, a `--wake`. The cadence terms hold on a
// woken item (a person's wake stands in for the cadence), so an item the scheduler
// filed on its own never carries the field. Stamped by the lever that woke it,
// never inferred from a comment.
export const WOKEN_FIELD = 'Woken';

// The three fields a REQUEST item carries (docs/PRINCIPLES.md). `Request` is the issue this
// run implements — the whole payload, since the request task has no code-work phase
// to hand one over. `Model` is the family the asker chose, read only by a task that
// declares `model_from_request`; it is the first thing an item carries that defines
// behaviour, which is why it is fenced rather than waved through (PRINCIPLES.md).
export const REQUEST_FIELD = 'Request';
export const MODEL_FIELD = 'Model';

// `Task` is the TARGETING field (PRINCIPLES.md, the one-issue request): which task a
// marked issue asks for, as `<pack>/<task>`. Absent, the ask is the built-in
// request implementer, which is what an ordinary "implement this issue" mark means.
// It rides the same author gate as `Model` and `Merge`: naming a task is choosing
// what runs, and a body is editable by whoever opened the issue.
export const TASK_FIELD = 'Task';

// `Merge` is the asker's standing authorization: a POLICY EXPRESSION the run
// hands to the merge-policy engine - `anything`, a `a;b;reject:c`
// rule list, or the legacy `if-narrow` (the narrow-diff composite). The run may
// land its own pull request only on that engine's yes, and must park for
// approval otherwise. An absent field is the default — never merge — so an item
// an older scheduler run wrote reads as unauthorized rather than as authorized.
export const MERGE_FIELD = 'Merge';
// The field's one pre-policy value, still the canonical spelling the legacy
// `yes`/`true` aliases collapse to on their way in.
export const MERGE_IF_NARROW = 'if-narrow';

// The heading the delivered-artifacts section carries in a work item body. One
// home, because it is written in three places and MATCHED when a re-entrant run
// updates the section it already wrote.
export const DELIVERED_HEADING = 'Delivered by code-work';

// The same heading as earlier renames spelled it. A live item's body still carries
// whichever word was current when its section was first written, and matching only
// today's would append a SECOND section rather than updating that one.
// @legacy-tolerance advisory:none retire:#1642
export const LEGACY_DELIVERED_HEADINGS = Object.freeze([
  'Delivered by prework',
  'Delivered by code_work',
]);

// --- the machine block (docs/PRINCIPLES.md) ----------------------------------
// A one-issue request's item IS the issue somebody marked, so the item's fields
// share a body a person authored and keeps editing. They live in one delimited
// block, appended at adoption and rewritten in place after that: everything outside
// it belongs to the human, everything inside it to the machine, and a parser that
// read the whole body would take a sentence of prose for a field.
//
// A `[claudinite-work]` item has no block — its whole body is the machine's — so
// every reader here falls back to the whole text, which is what keeps items filed
// before the one-issue model draining unchanged.
export const MACHINE_BLOCK_START = '<!-- claudinite-item -->';
export const MACHINE_BLOCK_END = '<!-- /claudinite-item -->';

// The heading of the item's own `### Progress` section — the running account a holder
// appends to while it works.
export const PROGRESS_HEADING = 'Progress';

// The heading of the section a no-go roll keeps on the item: the last declined reason
// and the next wake.
export const LAST_VERDICT_HEADING = 'Last verdict';

// --- the leases -------------------------------------------------------------------
// The queue's leases and bounds, in one place because three surfaces must agree
// on them (docs/PRINCIPLES.md): the scheduler run reclaims on the executing leash,
// the janitor sweeps on the agent leash and the stale bounds, and the task
// contract rejects at author time any code-work whose declared timeout reaches the
// executing leash (F17 — a code-work reclaimed while alive livelocks its item).
//
// The vendored workflows carry the fourth agreement (PRINCIPLES.md): HEARTBEAT
// INTERVAL < EXECUTING LEASH, so a holder that is alive is never reclaimed. A
// zombie's code-work running beside its replacement's is covered by code-work's own
// re-entrancy requirement, since a partitioned runner can keep working while its
// beats fail to post.

// A dead executor claim is reclaimed after this much silence — the holder's own
// silence, measured from its last claim or heartbeat (#924), never the issue's
// `updated_at`. Long work is legal; a holder that stops beating is not alive.
export const EXECUTING_LEASH_MS = 60 * 60e3;

// An agent session silent this long is declared dead. A legitimately longer run
// must comment on its item to reset the activity clock — stated as an assumption
// rather than discovered as an incident.
export const AGENT_LEASH_MS = 3 * 3600e3;

// An item nothing picked up for this many of its own periods leaves the queue for
// triage; a blocked item whose blockers never resolve is surfaced (comment only)
// after this long.
export const STALE_READY_PERIODS = 2;
export const STUCK_BLOCKED_MS = 2 * 86400e3;


// --- the commit trailers ---------------------------------------------------------
// `Claudinite-Task: <pack>/<task>` says a scheduled task wrote this commit; the
// movement terms read it, so the writer classifies its own output and a task added
// tomorrow is classified correctly on its first run. `Claudinite-Automerge-Policy:
// <policy>` is the arming trailer the landing lane reads.
// A trailer is what survives a squash merge into the default branch, which is the
// commit the `commits` collector actually reads.
export const TASK_TRAILER = 'Claudinite-Task';
export const AUTOMERGE_TRAILER = 'Claudinite-Automerge-Policy';

// --- the declaration defaults (owner, 2026-09-03) --------------------------------------
// The one place a declaration's absent field becomes a value, so nothing downstream
// ever reads an undefined one: land nothing unreviewed, and no agent.
export const DEFAULT_AUTOMERGE = 'nothing';
export const DEFAULT_AGENT_MODEL = 'none';

// --- this pack's own parameters -------------------------------------------------------
// Whose parameter dormancy is, and the key it is declared under on that pack's entry in
// `.claudinite-settings.json` (`{ "id": "claudinite-tasks", "config": { "dormant": true } }`).
// Exported because a reader that has to name the pack to find its config should name
// it from here rather than spell the id a second time.
export const TASKS_PACK_ID = 'claudinite-tasks';
export const DORMANT_CONFIG_KEY = 'dormant';

// --- the two workflow files -------------------------------------------------------------
// The vendored stubs' file names, identical in every member: the usage fold finds a
// repo's scheduler runs by the first, and every `workflow_dispatch` in the queue's chain
// names the second.
export const SCHEDULER_WORKFLOW_FILE = 'claudinite-scheduler.yml';
export const EXECUTOR_WORKFLOW_FILE = 'claudinite-executor.yml';
