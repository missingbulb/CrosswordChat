// The work item's grammar — the queue's one durable object (docs/PRINCIPLES.md),
// as the parse and serialize over its vocabulary (`task-constants.mjs`). An issue
// titled `[claudinite-work] <pack>/<task> [qualifier]`, whose labels are its state,
// whose body's first line is the task path, and whose optional body fields
// (`Not-before`, `Blocked-by`, and a request's `Request` / `Model`) are the only
// facts it carries beyond that.
//
// PURE, and deliberately the whole schema: everything else — anchors, guards,
// yields, leashes, verdicts — is computed fresh at every scheduler run and pick from the
// engine and the declarations at HEAD (PRINCIPLES.md). The label-and-field vocabulary
// is therefore the compatibility surface across engine versions, and this file is the
// one definition of how it is read and written: `src/` imports it from here, as does
// every other pack — the dashboard loads it unbundled in a browser, which is why
// nothing here reaches a Node built-in.
//
// Parse/serialize of those fields lives here and nowhere else (PRINCIPLES.md).
//
// Two imports, both frozen data: the vocabulary this grammar is over, and the
// pack-rename map, which the title parse needs to keep reading titles written before
// a rename (see parseWorkItemTitle).
import { canonicalPackId } from '../../../engine/pack_loader/renamed-packs.mjs';
import {
  WORK_PREFIX, PARK_PREFIX, STATUS_BLOCKED, STATUS_READY, STATUS_RUNNING_EXECUTOR,
  STATUS_RUNNING_AGENT, STATUS_NEEDS_HUMAN_FAILURE, STATUS_DONE, STATUS_REJECTED, PARK_KINDS,
  PARK_STATUSES, STATUS_LABELS, ORIGIN_AD_HOC, ORIGIN_LABELS, ASKED_FOR_ORIGINS,
  LEGACY_BLOCKED, LEGACY_READY, LEGACY_EXECUTING, LEGACY_AGENT, NEEDS_HUMAN,
  OUTCOME_DELIVERED, OUTCOME_DONE, OUTCOME_OBSOLETE, LEGACY_TASK_DONE, LEGACY_TASK_OBSOLETE,
  ORIGIN_SCHEDULE, REQUEST_MODELS, NOT_BEFORE_FIELD, BLOCKED_BY_FIELD, ENDS_WHEN_FIELD,
  ENDS_WHEN_CLOSED, TARGET_BRANCH_FIELD, TARGET_PR_FIELD, SUPERSEDES_FIELD, WOKEN_FIELD,
  REQUEST_FIELD, MODEL_FIELD, MERGE_FIELD, MERGE_IF_NARROW, DELIVERED_HEADING,
  MACHINE_BLOCK_START, MACHINE_BLOCK_END, PROGRESS_HEADING, LAST_VERDICT_HEADING, TASK_TRAILER,
} from './task-constants.mjs';

// WHICH PARK IS A BROKEN RUN. A park is not live, so no park holds its task's lane by
// itself: the scheduler asks the task again on its own conditions, and only a task
// declaring `last-run-not-failed` stops past its own failure. What this predicate
// tells apart is the park a person DIAGNOSES from the three that are a person's
// inbox — a PR waiting to be approved, a choice waiting to be made, a secret waiting
// to be set — which is the split every renderer alarms on and the run-history term
// reads (`parkKindOf`).
//
// A park wearing NO sub-label counts as broken, which is what makes this safe on the
// way in: every item parked by an engine older than the sub-labels, and every kind
// word a future engine invents that this one does not know, reads as "diagnose me"
// rather than quietly joining the mechanical lane.
export const isBlockingPark = (item) => statusOf(item) === STATUS_NEEDS_HUMAN_FAILURE;

// --- the decode (PRINCIPLES.md, "legacy spellings — written never, read forever") --
// Labels are STORED DATA: open items filed by a fielded engine wear its spellings,
// closed items keep theirs forever, and members converge on their own schedules. So
// every reader here goes through one pass that maps every spelling ever written
// straight to today's — never through a literal comparison against one of them.
// @legacy-tolerance advisory:none retire:#1642
const LEGACY_STATUS = new Map([
  [LEGACY_BLOCKED, STATUS_BLOCKED],
  [LEGACY_READY, STATUS_READY],
  [LEGACY_EXECUTING, STATUS_RUNNING_EXECUTOR],
  [LEGACY_AGENT, STATUS_RUNNING_AGENT],
  [LEGACY_TASK_DONE, STATUS_DONE], [OUTCOME_DONE, STATUS_DONE],
  [LEGACY_TASK_OBSOLETE, STATUS_REJECTED], [OUTCOME_OBSOLETE, STATUS_REJECTED],
]);

// @legacy-tolerance advisory:none retire:#1642
const LEGACY_PARK_RE = /^task:needs-human-(.+)$/;

// The park an issue's labels name, canonical, or null. Both shapes decode here:
// today's single `task:status:needs-human-<kind>` and the legacy pair
// (`needs-human` plus a sub-label). A kind nobody here knows — a bare legacy park,
// or a word a newer engine invented — reads as `failure`, the conservative lane.
function parkOf(names) {
  const kinds = [
    ...names.filter((n) => n.startsWith(PARK_PREFIX)).map((n) => n.slice(PARK_PREFIX.length)),
    ...names.map((n) => LEGACY_PARK_RE.exec(n)?.[1]).filter(Boolean),
  ];
  if (!kinds.length && !names.includes(NEEDS_HUMAN)) return null;
  return `${PARK_PREFIX}${PARK_KINDS.find((k) => kinds.includes(k)) ?? 'failure'}`;
}

// Every distinct status an issue's labels decode to. One entry per status, so an
// item mid-flip — wearing a legacy spelling beside its canonical one — reads as the
// ONE status it is, and only genuinely conflicting labels read as more than one
// (the dashboard's `torn`).
export function statusesOn(issue) {
  const names = labelNames(issue);
  const out = new Set();
  const park = parkOf(names);
  if (park) out.add(park);
  for (const n of names) {
    if (STATUS_LABELS.includes(n) && !n.startsWith(PARK_PREFIX)) out.add(n);
    else if (LEGACY_STATUS.has(n)) out.add(LEGACY_STATUS.get(n));
  }
  return [...out];
}

// THE status an issue wears, canonical, or null for one wearing none. A park wins
// over anything else present: a torn transition that left a state label beside a
// park must read as parked, or the queue would pick up an item a human owns.
export function statusOf(issue) {
  const worn = statusesOn(issue);
  return worn.find((s) => s.startsWith(PARK_PREFIX))
    ?? STATUS_LABELS.find((s) => worn.includes(s))
    ?? null;
}

export const isStatus = (issue, status) => statusOf(issue) === status;
export const isParked = (issue) => (statusOf(issue) ?? '').startsWith(PARK_PREFIX);
export const parkKindOf = (issue) =>
  (isParked(issue) ? statusOf(issue).slice(PARK_PREFIX.length) : null);

// The origin an issue wears, or null. Unlike the status there is no legacy
// spelling to fold in: `origin:schedule` is inert stored data (see ORIGIN_SCHEDULE),
// and reading it as an origin would put a marker nothing writes back into play.
export const originOf = (issue) =>
  labelNames(issue).find((n) => ORIGIN_LABELS.includes(n)) ?? null;

// Every spelling that MEANS `status` — what a transition out of it has to clear,
// since the item may wear any engine's. Leaving a park clears every park spelling
// whatever its kind: a re-queue takes the item out of the human's hands entirely.
export function spellingsOf(status) {
  if (String(status ?? '').startsWith(PARK_PREFIX)) {
    return [...PARK_STATUSES, ...PARK_KINDS.map((k) => `task:needs-human-${k}`), NEEDS_HUMAN];
  }
  const legacy = [...LEGACY_STATUS].filter(([, canonical]) => canonical === status).map(([l]) => l);
  return [status, ...legacy];
}

// A kind word (from a worker's own triage marker, or a call site) to the park it
// names. Anything unrecognised is a `failure`: a worker that misspells its class has
// a bug, which is exactly what that lane means.
export const triageLabelFor = (kind) =>
  (PARK_KINDS.includes(kind) ? `${PARK_PREFIX}${kind}` : STATUS_NEEDS_HUMAN_FAILURE);


// The stored-data rename rule, decode side: every spelling ever written maps
// STRAIGHT to the canonical word, in one pass — including `outcome:delivered`,
// which nothing writes any more but closed issues carry forever.
const OUTCOME_WORDS = new Map([[STATUS_DONE, 'done'], [STATUS_REJECTED, 'obsolete']]);

// The one outcome an issue's labels carry, as the canonical word ('done',
// 'delivered', 'obsolete') or null. Everything that tallies or renders outcomes
// decodes through here, so a spelling change is one map entry and not a sweep.
export function outcomeOf(issue) {
  // `statusesOn` rather than `statusOf`: a closed item's terminal write is its
  // outcome even when a park label stands beside it, and park precedence is a
  // question about LIVE items — what the queue may pick up — not about history.
  const worn = statusesOn(issue);
  for (const [status, word] of OUTCOME_WORDS) if (worn.includes(status)) return word;
  return hasLabel(issue, OUTCOME_DELIVERED) ? 'delivered' : null;
}

// GitHub hands labels back as objects on the issues API and as bare strings in
// some fixtures; accept either.
export const labelNames = (issue) =>
  (issue?.labels ?? []).map((l) => (typeof l === 'string' ? l : l?.name)).filter(Boolean);

export const hasLabel = (issue, name) => labelNames(issue).includes(name);

// Title. The optional qualifier exists ONLY for deliberately concurrent items —
// a fan-out naming its target — and it is part of the identity the same-title
// mutex reads (PRINCIPLES.md). Nothing ever encodes a date here: that was the slot
// grammar, and the issue number is the identity (PRINCIPLES.md).
export const workItemTitle = ({ pack, task, qualifier = null }) =>
  `${WORK_PREFIX} ${pack}/${task}${qualifier ? ` ${qualifier}` : ''}`;

// pack and task ids are single path segments; the qualifier is whatever follows.
const TITLE_RE = /^\[claudinite-work\]\s+([^/\s]+)\/([^/\s]+)(?:\s+(\S.*))?$/;

// The pack half is canonicalized on the way out. A work item's title is STORED
// DATA — it sits on an open GitHub issue that outlives any one converge — so items
// filed before a pack was renamed still carry the old spelling. Read literally, the
// scheduler run would not recognise its own live item, would file a second one beside it, and
// would leave the first orphaned in the queue with nothing ever draining it.
export function parseWorkItemTitle(title) {
  const m = TITLE_RE.exec(String(title ?? '').trim());
  return m ? { pack: canonicalPackId(m[1]), task: m[2], qualifier: m[3]?.trim() || null } : null;
}

export const isWorkItemTitle = (title) => parseWorkItemTitle(title) !== null;

// The `<pack>/<task>` id a WORKER PATH names — the identity half a marked issue's
// title cannot carry (PRINCIPLES.md), read off the path its machine block names. Two
// shapes, because tasks have two homes: the `tasks/` slot a declared pack contributes,
// and the queue's own built-in root. The `.claudinite/shared/` prefix is optional in
// both — a member's mount is there and the canon runs its own tree.
//
// THE BUILT-IN ROOT HAS TWO SPELLINGS, and both are permanent. The surface moved from
// `engine/scheduler/` to the tasks pack (#1317), so a live item minted before the move
// still names the engine path while every new one names the pack path; the wire id
// either produces is unchanged, which is what the move promised. Stored data is
// renamed on the DECODE side or it stops decoding, and here that failure is silent:
// this is the fallback for a marked issue, whose title is the requester's own words,
// so a path that yields null leaves the item unattributable rather than rejected.
//
// It is a PARSE, not a lookup: anything that must know the task exists at HEAD
// resolves the path against the discovered task set instead (the executor does).
const PACK_TASK_PATH_RE = /^(?:\.claudinite\/shared\/)?packs\/([^/]+)\/tasks\/([^/]+)\/[^/]+$/;
const BUILT_IN_TASK_PATH_RE = /^(?:\.claudinite\/shared\/)?(?:engine\/scheduler|packs\/claudinite-tasks)\/queue\/tasks\/([^/]+)\/[^/]+$/;
// The built-in spec's `public/` home, which new items name. `taskIdFromPath` is the
// DECODE side, so this is read forever beside the two above: an item minted today
// outlives any number of moves, and an undecodable path leaves it unattributable.
export const BUILT_IN_PUBLIC_TASK_PATH_RE = /^(?:\.claudinite\/(?:shared|local)\/)?packs\/claudinite-tasks\/public\/(implement-request)\.md$/;

export function taskIdFromPath(path) {
  const p = String(path ?? '');
  const pack = PACK_TASK_PATH_RE.exec(p);
  if (pack) return { pack: canonicalPackId(pack[1]), task: pack[2] };
  const builtIn = BUILT_IN_TASK_PATH_RE.exec(p) ?? BUILT_IN_PUBLIC_TASK_PATH_RE.exec(p);
  return builtIn ? { pack: 'engine', task: builtIn[1] } : null;
}

// STANDING OR AD-HOC, DERIVED (PRINCIPLES.md). A task's standing item is the one
// the scheduler files when the task says yes: its title names the task and nothing
// else, and the task it names is on the schedule. Everything else is ad-hoc — an
// unscheduled task's item (the scheduler never asks it) and every qualified item
// (a fan-out target, a request naming its issue), each of which may legitimately
// run beside the occurrence rather than being it.
//
// It is read off the item and the declaration at HEAD rather than off a label the
// creator applied, because the two could disagree: a marker says what its writer
// believed, the structure says what the item IS, and the guards that consume this
// (the live-item guard, the dedupe, the `after` yield) are only sound on the
// second. `scheduled` is whether the task the title names is asked by the
// scheduler (`isScheduledTask` in task-contract.mjs) — null when the repo no
// longer carries it, which is ad-hoc by the same rule.
export function isStandingItem(item, scheduled) {
  const parsed = parseWorkItemTitle(item?.title ?? item);
  return !!parsed && parsed.qualifier === null && scheduled === true;
}

// A Merge/Automerge field value, fenced to what the policy engine can read: the
// canonical expression, or null for anything else. Fencing here is about SHAPE
// only — a well-formed policy naming a rule nobody defines rides through and
// fails closed at the verdict, loudly, which is better feedback than silently
// ignoring the ask. A policy of `nothing` is the default already, so it reads
// as absent.
//
// The grammar mirrors merge-policy.mjs's normalizePolicy — the semantic
// authority — and cannot import it: this module is deliberately pure (see the
// header), so the drift guard is the test that runs a value matrix through both
// sides (test/queue/request-mode.test.mjs).
const RULE_NAME = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const PATH_SEGMENT = /^[A-Za-z0-9._-]+$/;
const policyName = (name) => {
  if (!name.startsWith('under:')) return RULE_NAME.test(name);
  const segments = name.slice('under:'.length).replace(/\/+$/, '').split('/');
  return segments.every((seg) => PATH_SEGMENT.test(seg) && seg !== '.' && seg !== '..');
};
// A term is `&&`-joined names, optionally reject:-prefixed. The value is returned
// CANONICAL — whitespace around `&&` collapsed — so an item body, and the trailer
// stamped from it, stay whitespace-free whatever a person typed.
function policyFieldValue(raw) {
  if (raw == null) return null;
  const value = String(raw).trim();
  if (['if-narrow', 'yes', 'true'].includes(value.toLowerCase())) return MERGE_IF_NARROW;
  if (value.toLowerCase() === 'anything') return 'anything';
  const terms = value.split(';').map((term) => {
    const prefix = term.trim().startsWith('reject:') ? 'reject:' : '';
    const names = term.trim().slice(prefix.length).split('&&').map((n) => n.trim());
    return { prefix, names, canonical: prefix + names.join('&&') };
  });
  const wellFormed = terms.length > 0
    && terms.every(({ names }) => names.every((n) => policyName(n) && n !== 'nothing'))
    && terms.some(({ prefix }) => !prefix);
  return wellFormed ? terms.map((t) => t.canonical).join(';') : null;
}

const BLOCK_RE = /<!-- claudinite-item -->\n?([\s\S]*?)\n?<!-- \/claudinite-item -->/;

// The machine's half of a body, or null where there is no block at all.
export const machineBlockOf = (body) => BLOCK_RE.exec(String(body ?? ''))?.[1] ?? null;

// The machine's half to read fields out of: the block where there is one, the whole
// body otherwise.
export const itemFieldText = (body) => machineBlockOf(body) ?? String(body ?? '');

// Replace the block, or append one to a body that has none. The human's text is
// never rewritten — an append lands after it, separated by a blank line.
export function withMachineBlock(body, block) {
  const text = String(body ?? '');
  const wrapped = `${MACHINE_BLOCK_START}\n${block.replace(/\s*$/, '')}\n${MACHINE_BLOCK_END}`;
  if (BLOCK_RE.test(text)) return text.replace(BLOCK_RE, wrapped);
  return `${text.replace(/\s*$/, '')}\n\n${wrapped}\n`;
}

// Apply an edit to whichever half is the machine's. Every writer that reshapes an
// item body — a Context section, code-work's delivered list, a stamped
// `Not-before` — goes through here, so it edits the block on a marked issue and the
// whole body on a `[claudinite-work]` item, with one call site either way.
export function editItemBody(body, edit) {
  const block = machineBlockOf(body);
  return block === null ? edit(String(body ?? '')) : withMachineBlock(body, edit(block));
}

// The human's half of a body — everything the machine block is not. A marked
// issue's PARAMETERS are read from here and never from the block: re-asking clears
// the status and leaves the previous run's block standing, and a parser that read
// the whole body would find that stale copy beside the person's own field.
export const humanTextOf = (body) => String(body ?? '').replace(BLOCK_RE, '').trim();

const NOT_BEFORE_RE = /^Not-before:[ \t]*(.*)$/m;
const BLOCKED_BY_RE = /^Blocked-by:[ \t]*(.*)$/m;
const REQUEST_RE = /^Request:[ \t]*#?(\d+)/m;
const MODEL_RE = /^Model:[ \t]*(\S+)/m;
const MERGE_RE = /^Merge:[ \t]*(\S+)/m;
const ENDS_WHEN_RE = /^Ends-when:[ \t]*#(\d+)[ \t]+(\S+)[ \t]*$/m;
const TARGET_BRANCH_RE = /^Target-branch:[ \t]*(\S+)[ \t]*$/m;
const TARGET_PR_RE = /^Target-pr:[ \t]*#?(\d+)[ \t]*$/m;
const SUPERSEDES_RE = /^Supersedes:[ \t]*(.*)$/m;
const WOKEN_RE = /^Woken:[ \t]*(\S+)[ \t]*$/m;

// Build a work item body. The first line is the task path — the only thing an
// executor reads to locate the worker, validated in code before anything trusts
// it. Everything behavior-defining (model, ceiling, worker content, code-work
// command) is read from the tracked task files at HEAD, never from here.
export function workItemBody({
  taskPath, notBefore = null, blockedBy = [], context = [], delivered = [], reason = null,
  request = null, model = null, merge = null, woken = null,
}) {
  const lines = [taskPath, ''];
  const fields = [];
  if (notBefore) fields.push(`${NOT_BEFORE_FIELD}: ${notBefore}`);
  if (blockedBy.length) fields.push(`${BLOCKED_BY_FIELD}: ${blockedBy.map((n) => `#${n}`).join(', ')}`);
  if (request) fields.push(`${REQUEST_FIELD}: #${request}`);
  if (model) fields.push(`${MODEL_FIELD}: ${model}`);
  if (merge) fields.push(`${MERGE_FIELD}: ${merge}`);
  if (woken) fields.push(`${WOKEN_FIELD}: ${woken}`);
  if (fields.length) lines.push(...fields, '');
  lines.push('Execute the Claudinite task above.');
  if (context.length) {
    lines.push(
      'The Context section below is binding scope — do not re-decide it.',
      '',
      '### Context',
      ...context.map((c) => `- ${c}`),
    );
  }
  if (reason) lines.push('', '### Why the agent is here', '', `- ${reason}`);
  if (delivered.length) lines.push('', `### ${DELIVERED_HEADING}`, '', ...delivered.map((d) => `- ${d}`));
  return lines.join('\n') + '\n';
}

// The `Blocked-by` numbers a body names, from a work item's body or from an
// ORDINARY issue's — a request marked for implementation states what it waits on in
// the same field spelling, and adoption carries it onto the item it births (PRINCIPLES.md).
export function parseBlockedBy(body) {
  const bb = BLOCKED_BY_RE.exec(String(body ?? ''))?.[1] ?? '';
  return [...bb.matchAll(/#(\d+)/g)].map((m) => Number(m[1]));
}

// Parse an item body back into the facts the scheduler run and the executor read. A body
// with no first line, or whose fields are absent, yields nulls — absence is
// meaningful everywhere here and is never filled in with a default.
export function parseWorkItemBody(body) {
  const text = itemFieldText(body);
  const taskPath = text.split('\n').map((l) => l.trim()).find((l) => l !== '') ?? null;
  const nb = NOT_BEFORE_RE.exec(text)?.[1]?.trim() || null;
  const blockedBy = parseBlockedBy(text);
  const request = REQUEST_RE.exec(text) ? Number(REQUEST_RE.exec(text)[1]) : null;
  // An unrecognised family reads as absent rather than as itself: the item's model
  // is behaviour-defining, so the only values that leave this parser are ones the
  // engine can actually dispatch at (PRINCIPLES.md).
  const askedModel = MODEL_RE.exec(text)?.[1] ?? null;
  const model = REQUEST_MODELS.includes(askedModel) ? askedModel : null;
  // Same fencing as the model: an authorization that does not read as a policy
  // expression reads as absent, and absent is the safe end of this field — a run
  // that cannot read its permission opens a pull request and waits.
  const merge = policyFieldValue(MERGE_RE.exec(text)?.[1] ?? null);
  // Same fencing again, and here it is what keeps the janitor honest: a condition
  // it cannot evaluate must read as "no end condition", never as one that is met.
  const ends = ENDS_WHEN_RE.exec(text);
  const endsWhen = ends && ends[2] === ENDS_WHEN_CLOSED ? Number(ends[1]) : null;
  const targetBranch = TARGET_BRANCH_RE.exec(text)?.[1] ?? null;
  const targetPr = TARGET_PR_RE.exec(text) ? Number(TARGET_PR_RE.exec(text)[1]) : null;
  const supersedes = [...(SUPERSEDES_RE.exec(text)?.[1] ?? '').matchAll(/#(\d+)/g)].map((m) => Number(m[1]));
  const woken = WOKEN_RE.exec(text)?.[1] ?? null;
  return { taskPath, notBefore: nb, blockedBy, request, model, merge, endsWhen, targetBranch, targetPr, supersedes, woken };
}

// THE ITEM'S OWN FACTS, as a precondition term sees them (docs/PRINCIPLES.md): the
// body's fields plus the two the terms read that are not fields — the issue number,
// and whether somebody created or woke this item. `woken` is everything that is
// NOT the scheduler's own ask: an item stamped by a lever, one born ad-hoc (a
// marked issue, a chain link), and any qualified item (a fan-out target, a request
// naming its issue) — the scheduler files only unqualified planned items, so an
// item of any other shape exists because somebody asked, which is what the cadence
// terms need to know.
export function itemFacts(item) {
  if (!item) return null;
  const fields = parseWorkItemBody(item.body);
  const parsed = parseWorkItemTitle(item.title);
  const schedulesOwn = !!parsed && parsed.qualifier === null && !ASKED_FOR_ORIGINS.includes(originOf(item));
  return {
    ...fields,
    number: item.number ?? null,
    woken: fields.woken !== null || !schedulesOwn,
  };
}

// WHAT A MARKED ISSUE ASKS FOR (docs/PRINCIPLES.md) — read from the
// person's own text at every adoption, so each ask names its parameters afresh and
// nothing stale outranks a new one.
//
// Whoever files the issue puts these on its FIRST LINES, as one block ahead of the
// prose — `basics/skills/do-later/SKILL.md` is where that placement is prescribed and
// argued. The parser does not care where they sit; a person editing the issue, and a
// retry rewriting `Not-before`, do.
//
// `gated` is whether the issue's AUTHOR holds push access. A body is editable by
// whoever opened the issue where a label was write-gated by the platform, so the
// three behaviour-defining fields are honoured only for an author who could have
// applied them as labels anyway; an ungated ask still runs, at the default task and
// model and with no authorization to land anything.
export function parseRequestFields(body, { gated = false } = {}) {
  const text = humanTextOf(body);
  const asked = {
    task: /^Task:[ \t]*(\S+)/m.exec(text)?.[1] ?? null,
    model: MODEL_RE.exec(text)?.[1] ?? null,
    automerge: /^Automerge:[ \t]*(.+?)[ \t]*$/m.exec(text)?.[1] ?? null,
  };
  const blockedBy = parseBlockedBy(text);
  const notBefore = NOT_BEFORE_RE.exec(text)?.[1]?.trim() || null;
  if (!gated) return { task: null, model: null, merge: null, blockedBy, notBefore, ungated: Object.values(asked).some(Boolean) };
  return {
    task: /^[^/\s]+\/[^/\s]+$/.test(asked.task ?? '') ? asked.task : null,
    // An unrecognised family reads as absent rather than failing the request: a run
    // nobody can start would look accepted forever.
    model: REQUEST_MODELS.includes(asked.model) ? asked.model : null,
    merge: policyFieldValue(asked.automerge),
    blockedBy,
    notBefore,
    ungated: false,
  };
}

// The item's own `### Context` bullets, in order — the binding scope a hand-created
// item was born with. Read back rather than kept only for the agent to read,
// because an operator's PARAMETERS ride here: `create-work-item --context
// "REPOS=Alpha Beta"` is how a forced run says what it is running on, and the
// executor hands these lines to code-work as `CLAUDINITE_CONTEXT`.
//
// A section runs to the next `### ` heading or to the end of the body — the same
// bounds `withSection` writes to — and only `- ` bullets count, so the prose
// framing around a section contributes nothing.
function sectionLines(body, heading) {
  const lines = String(body ?? '').split('\n');
  const at = lines.findIndex((l) => l.trim() === `### ${heading}`);
  if (at === -1) return [];
  const out = [];
  for (const line of lines.slice(at + 1)) {
    if (line.startsWith('### ')) break;
    const m = /^-[ \t]+(.*)$/.exec(line);
    if (m) out.push(m[1].trim());
  }
  return out;
}

export const parseContextLines = (body) => sectionLines(body, 'Context');

// The item's own `### Progress` bullets — the running account a holder appends to
// while it works. Read back so a beat can add a line without losing the ones before
// it: nothing can edit a posted comment, so the body is the only surface a long run
// has that grows in place instead of by repetition.
export const parseProgressLines = (body) => sectionLines(body, PROGRESS_HEADING);

// --- the roll's record ----------------------------------------------------------

// The section a no-go roll keeps on the item: the last declined reason and the next
// wake, REPLACED on every roll (the item is a status line, not a log — the timeline
// carries the history). Serializer and parser live together so the shape has one
// home; the executor writes it, and anything answering "why didn't it run" — the
// dashboard above all — reads it back.

export function lastVerdictLines({ at, reason, until }) {
  const lines = [`${at} — the precondition declined: ${reason}`];
  if (until) lines.push(`Asked again at ${until}.`);
  return lines;
}

export function parseLastVerdict(body) {
  const lines = sectionLines(body, LAST_VERDICT_HEADING);
  // The reason may carry the separator itself, so the split is on the FIRST match.
  const first = /^(.*?) — the precondition declined: ([\s\S]*)$/.exec(lines[0] ?? '');
  if (!first) return null;
  const until = lines.map((l) => /^Asked again at (.*?)\.?$/.exec(l)).find(Boolean)?.[1] ?? null;
  return { at: first[1], reason: first[2], until };
}

// Fold a second set of Context lines into the first, keeping order and dropping
// exact duplicates. Both sides are real scope — the item carries what its creator
// bound it to, the precondition adds what this occurrence found — and a set-write
// from either side would drop the other's.
export const mergeContext = (...groups) => [...new Set(groups.flat().filter((l) => l && l.trim()))];

// Stamp (or clear) `Not-before` on an existing body, in place where the field is
// already present and directly under the task path otherwise. Text surgery rather
// than a rebuild: the body also carries the creating precondition's Context and
// code-work's Delivered section, which belong to whoever wrote them.
export function withNotBefore(body, iso) {
  const text = String(body ?? '');
  if (NOT_BEFORE_RE.test(text)) {
    return iso
      ? text.replace(NOT_BEFORE_RE, `${NOT_BEFORE_FIELD}: ${iso}`)
      : text.replace(/^Not-before:[ \t]*.*\n?/m, '');
  }
  if (!iso) return text;
  const lines = text.split('\n');
  const at = lines.findIndex((l) => l.trim() !== '');
  if (at === -1) return `${NOT_BEFORE_FIELD}: ${iso}\n`;
  lines.splice(at + 1, 0, '', `${NOT_BEFORE_FIELD}: ${iso}`);
  return lines.join('\n');
}

// Stamp `Woken` on an existing body — the lever's write, same text surgery as
// `withNotBefore`. Re-stamping replaces the instant: an item woken twice was woken
// last at the later one, and the field says so once.
export function withWoken(body, iso) {
  return editItemBody(body, (text) => {
    if (WOKEN_RE.test(text)) return text.replace(WOKEN_RE, `${WOKEN_FIELD}: ${iso}`);
    const lines = String(text ?? '').split('\n');
    const at = lines.findIndex((l) => l.trim() !== '');
    if (at === -1) return `${WOKEN_FIELD}: ${iso}\n`;
    lines.splice(at + 1, 0, '', `${WOKEN_FIELD}: ${iso}`);
    return lines.join('\n');
  });
}

// Stamp `Ends-when` on an existing body, same text surgery as `withNotBefore` and
// for the same reason: the body carries sections that belong to whoever wrote them.
// Re-stamping replaces the condition rather than adding a second one — a converge
// that runs twice on one item must not leave two ends.
export function withEndsWhen(body, number) {
  const text = String(body ?? '');
  const field = `${ENDS_WHEN_FIELD}: #${number} ${ENDS_WHEN_CLOSED}`;
  if (ENDS_WHEN_RE.test(text)) return text.replace(ENDS_WHEN_RE, field);
  const lines = text.split('\n');
  const at = lines.findIndex((l) => l.trim() !== '');
  if (at === -1) return `${field}\n`;
  lines.splice(at + 1, 0, '', field);
  return lines.join('\n');
}

// Stamp the target's three lines, replacing whatever an earlier resolution left:
// a re-pick re-resolves, and the item must say what THIS episode works on, not
// both. A target with nothing to say (`none`, or no superseded set) clears its
// lines, and a body that never carried any is returned as it was. Same surgery as
// `withNotBefore`: the fields sit under the task path, ahead of the sections
// other writers own — and on a marked issue that path is the machine block's
// first line, never the person's prose, which is why this one routes through
// `editItemBody` itself rather than trusting every caller to.
export function withTarget(body, target) {
  return editItemBody(body, (text) => stampTarget(text, target));
}

function stampTarget(body, target) {
  const wanted = [];
  if (target?.branch) wanted.push(`${TARGET_BRANCH_FIELD}: ${target.branch}`);
  if (target?.pr != null && target?.mode === 'amend') wanted.push(`${TARGET_PR_FIELD}: #${target.pr}`);
  if (target?.supersedes?.length) wanted.push(`${SUPERSEDES_FIELD}: ${target.supersedes.map((n) => `#${n}`).join(', ')}`);
  const stripped = String(body ?? '')
    .replace(/^Target-branch:[ \t]*.*\n?/gm, '')
    .replace(/^Target-pr:[ \t]*.*\n?/gm, '')
    .replace(/^Supersedes:[ \t]*.*\n?/gm, '');
  if (!wanted.length) return stripped === String(body ?? '') ? body : stripped;
  const lines = stripped.split('\n');
  const at = lines.findIndex((l) => l.trim() !== '');
  if (at === -1) return `${wanted.join('\n')}\n`;
  lines.splice(at + 1, 0, '', ...wanted);
  return lines.join('\n');
}

// Set a section of an item body (the Context, code-work's Delivered, the agent's Why)
// — replacing one of the same heading if it is already there, appending otherwise.
//
// REPLACING IS THE WHOLE POINT, and appending was a live bug (#879). Every standing
// item is born carrying a `### Context`, and the hand-off writes Context again — so
// an append leaves TWO sections of that name, while the session is told to read "the
// issue's Context section", singular. The one it reads first is then the scheduler run's birth
// note and the binding scope is in the other, which fails silently whichever section
// the agent picks. It also grows: an item re-queued through hand-off twice carried a
// third.
//
// A section runs to the next `### ` heading or to the end of the body, so a replaced
// section keeps its position rather than migrating to the bottom — the body stays in
// the order a reader learned it.
// `aliases` are older spellings of the SAME heading. The section is rewritten under
// `heading`, but located by any of them, so a body written before a rename is updated
// in place instead of gaining a second section.
export function withSection(body, heading, lines, aliases = []) {
  if (!lines.length) return body;
  const text = String(body ?? '').replace(/\s*$/, '');
  const section = [`### ${heading}`, '', ...lines.map((l) => `- ${l}`)];
  const existing = text.split('\n');
  const wanted = new Set([heading, ...aliases].map((h) => `### ${h}`));
  const at = existing.findIndex((l) => wanted.has(l.trim()));
  if (at === -1) return `${text}\n\n${section.join('\n')}\n`;
  const after = existing.findIndex((l, i) => i > at && l.startsWith('### '));
  const tail = after === -1 ? [] : ['', ...existing.slice(after)];
  return `${[...existing.slice(0, at), ...section, ...tail].join('\n')}\n`;
}

// IS THIS ISSUE AN ITEM? Two shapes, and the second is what the one-issue request
// model added (PRINCIPLES.md): a filed `[claudinite-work]` issue, or an ordinary
// issue somebody marked `task:origin:ad-hoc` that has been ADOPTED — the mark alone
// is a request awaiting adoption, not yet an item, and reading it as one would have
// the janitor's stateless-repair rule park the person's issue for having no status.
//
// WHAT SAYS IT WAS ADOPTED IS EITHER ARTIFACT, and that is the point: adoption
// writes the machine block AND the first status, and the mark beside them is a
// LABEL a person can take off at any moment. Gated on the mark alone, an adopted
// item whose requester removed it drops out of every read of the queue at once —
// the executor never picks it, the precondition never gets to see the withdrawal
// and decline it, and the janitor's rules cannot sweep what they cannot list, so
// the item sits `waiting-for-executor` forever with nothing left to move it. Same
// shape as `converge-item`'s refusal (missingbulb/Shepherd#360): a membership test
// gated on the single artifact it exists to validate refuses exactly the items
// that artifact went missing from.
//
// It lives with the vocabulary rather than with the listing that applies it because
// the dashboard asks it in a BROWSER, where the listing's GitHub port does not load.
export const isQueueItem = (issue) =>
  String(issue?.title ?? '').startsWith(WORK_PREFIX)
  || machineBlockOf(issue?.body) !== null
  || (labelNames(issue).includes(ORIGIN_AD_HOC) && statusOf(issue) !== null);

// --- the task trailer -------------------------------------------------------------

// `Claudinite-Task: <pack>/<task>` on its own line, anywhere in the message.
export const TASK_TRAILER_RE = /^Claudinite-Task:[ \t]*(\S+)[ \t]*$/m;

// The trailer line to append to a commit message, or '' when the writer does not
// know which task it is running as (a hand-run worker, a member's own script) —
// so a caller can always interpolate the return value.
export const taskTrailer = (taskId) => (taskId ? `${TASK_TRAILER}: ${taskId}` : '');

// `message` with the trailer appended, separated by a blank line so it lands in
// the message's trailer block. A message that already carries the trailer is
// returned untouched: the lanes compose (a worker's own message, then the merge
// commit built from it), and a doubled trailer reads as two tasks.
export function withTaskTrailer(message, taskId) {
  const line = taskTrailer(taskId);
  if (!line || TASK_TRAILER_RE.test(message ?? '')) return message ?? '';
  return `${(message ?? '').trimEnd()}\n\n${line}\n`;
}

// Which task wrote this commit, or null when nothing did. `null` is UNKNOWN as
// much as it is "a person wrote it" — every caller pairs it with the older
// author/title/path exclusions, which is what still classifies history from
// before the trailer existed.
export function taskFromMessage(message) {
  const m = TASK_TRAILER_RE.exec(message ?? '');
  return m ? m[1] : null;
}
