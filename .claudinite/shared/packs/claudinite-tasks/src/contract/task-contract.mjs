// The task declaration contract (docs/PRINCIPLES.md) — the single
// source of truth for what a `tasks/<name>/task.json` must carry.
// Both the author-time `task-declaration-shape` check and the executor-side
// `validate-dispatch` validate against this one function, so the accepted shape
// can never drift between the two surfaces.

import { FREQUENCIES, CADENCES, cadenceTermFor, cadenceOf, normalizeCadenceTerms, scheduleTermFor } from './calendar.mjs';
import { MODEL_FAMILIES } from './model-map.mjs';
import { EXECUTING_LEASH_MS } from '../../public/task-constants.mjs';
import { normalizePolicy } from './merge-policy.mjs';
import { validatePreconditions, preconditionSignals } from './precondition-policy.mjs';
import { applyTaskDefaults } from './task-defaults.mjs';

// A declared timeout is always a whole number of seconds, > 0.
const isPositiveInt = (n) => Number.isInteger(n) && n > 0;

// A code-work command must stay inside its own task directory — no absolute
// path and no `..` traversal in the command string — the same containment the
// worker-file rule gives agent_instructions (docs/PRINCIPLES.md).
const escapesTaskDir = (cmd) => /(^|\s)\//.test(cmd) || cmd.includes('..');

// Task execution is two similar, consecutive phases — deterministic CODE-WORK,
// then AGENTIC WORK — and the field names say so. Neither phase is named for
// the other: the code phase is not preparation for the agent, it is the first
// of two peers, and a task may declare only it.

// The defaults live in task-defaults.mjs — a module with no imports, so the
// dashboard's browser bundle can fill them the way the loader does.
export { DEFAULT_AUTOMERGE, DEFAULT_AGENT_MODEL } from './task-defaults.mjs';

// WHO MINTS AN OCCURRENCE, and WHAT MUST HOLD once one exists (docs/PRINCIPLES.md).
// Two fields, one sentence: `trigger` says whether the scheduler asks
// this task at every tick, `preconditions` says what has to be true for the run to
// go ahead — judged identically at a tick and at a pick. A `request` task is asked
// by nobody and runs from an item somebody created: a marked issue, a wake, a chain
// link, a fan-out target.
export const TRIGGER_SCHEDULE = 'schedule';
export const TRIGGER_REQUEST = 'request';
export const TRIGGERS = Object.freeze([TRIGGER_SCHEDULE, TRIGGER_REQUEST]);

// Does this task have a deterministic work step at all, in either of the forms it
// may be declared in? Every reader asking "is there code-work here" asks through
// this, so the two forms cannot drift apart into one being honoured and the other
// silently skipped.
export const declaresCodeWork = (decl) =>
  decl?.code_work !== undefined || decl?.code_worker_mjs !== undefined;

// The cadence a task keeps, as the term it states — `null` where it states none.
export const taskCadence = (decl) => cadenceOf(decl?.preconditions);
export const isScheduledTask = (decl) => decl?.trigger === TRIGGER_SCHEDULE;

// Return the declaration with canonical field names and the defaults filled in.
// Non-objects pass through untouched so validateTaskDeclaration still reports
// them. Loaders (discover, resolve-dispatch) normalize once; everything
// downstream sees only `code_work` and never an absent defaulted field.
export function normalizeTaskDeclaration(decl) {
  if (decl === null || typeof decl !== 'object' || Array.isArray(decl)) return decl;
  const out = { ...decl };
  // The editor's schema pointer, when a caller hands over a parsed task.json whole.
  delete out.$schema;
  // THE CADENCE-SPELLING DOOR (calendar.mjs, DUE_TERM). `due:<cadence>` is the same
  // term under the name it was introduced with, permanently accepted because a task
  // declaration is member-owned data no vendoring pass rewrites. Rewriting it here
  // means every reader downstream of a loaded declaration sees one spelling, and the
  // evaluator's own alias covers the callers that did not come through this door.
  out.preconditions = normalizeCadenceTerms(out.preconditions);
  // A declaration stating no conditions carries the empty expression from here on,
  // so every reader judges one array: at a pick it holds, at a tick it is never asked.
  if (out.preconditions === undefined) out.preconditions = [];
  return applyTaskDefaults(out);
}

// What a task's run does to PULL REQUESTS (docs/PRINCIPLES.md, decision
// PRINCIPLES.md) — the write ceiling and the target in one word, resolved once by the
// executor before code-work and handed to both phases:
//   no_code_changes                  — never opens one.
//   fresh_pr                         — one on a freshly minted branch; the task's
//                                      earlier pull requests are left as they are.
//   amend_existing_or_create_new_pr  — pushes onto the task's newest open pull
//                                      request while it has no conflicts with its
//                                      base; a fresh branch otherwise.
//   supersede_existing_pr            — a fresh branch, and once the run's own pull
//                                      request exists the task's earlier ones close
//                                      as superseded (a green, unlanded one on an
//                                      auto-merge repo is landed instead).
// A declared MAXIMUM, not a promise: "no change" is always legal, and what (if
// anything) the run may then MERGE is the separate `automerge` policy — 'nothing',
// 'anything', or a list of diff classes merge-policy.mjs evaluates the actual diff
// against.
export const OUTCOMES = ['no_code_changes', 'fresh_pr', 'amend_existing_or_create_new_pr', 'supersede_existing_pr'];
export const OUTCOME_NO_PR = 'no_code_changes';

// Whether a (canonical) outcome lets the run open a pull request at all — the
// half of the contract `automerge` hangs off.
export const opensPullRequest = (outcome) => outcome !== OUTCOME_NO_PR;

// The declared ceiling, or null for a word that is not one. Callers hold raw
// declarations as often as normalized ones, so the question "is this a ceiling, and
// which" has one answer here rather than an `OUTCOMES.includes` at each site.
export const canonicalOutcome = (outcome) => (OUTCOMES.includes(outcome) ? outcome : null);

// What must happen to a task's work item when a recovery path would re-execute it
// (docs/PRINCIPLES.md). `requeue` is the safe-side default for sweep-shaped
// work; `needs-human` is the at-most-once dial a one-shot side effect declares.
export const INTERRUPT_POLICIES = ['requeue', 'needs-human'];


// The signal-collector vocabulary (PRINCIPLES.md). A task collects only the union
// of what its due tasks declare. `fleet` is canon-only (consumers cannot declare
// it) — that restriction is enforced where signals are collected, not here; the
// shape check only asserts a declared name is a real collector.
export const SIGNAL_NAMES = [
  'commits', 'prs', 'issues', 'branches', 'release',
  'localPacks', 'sharedMount', 'conversationLogs', 'stamp', 'fleet', 'request',
];

// `description` — what the task does, or why it exists, for the person reading the
// declaration or a roster of them: free prose, bounded so it stays a summary. It
// must not restate what the other fields already say (the cadence, the
// conditions, the policy, the files); the writing-tasks skill holds that rule,
// which no check can read.
export const DESCRIPTION_MAX_WORDS = 50;
export const wordCount = (text) => String(text).trim().split(/\s+/).filter(Boolean).length;
export function descriptionProblem(description) {
  if (typeof description !== 'string') return { what: `"description" is not a string`, fix: 'write one sentence or two saying what the task does or why it exists' };
  if (description.trim() === '') return { what: '"description" is empty', fix: 'say what the task does or why it exists, or drop the field' };
  const words = wordCount(description);
  if (words > DESCRIPTION_MAX_WORDS) return { what: `"description" runs to ${words} words`, fix: `keep it to ${DESCRIPTION_MAX_WORDS} words — a summary, not the README` };
  return null;
}

// Validate one task declaration. Returns an array of `{ what, fix }` problems —
// empty means the declaration is well-formed. Pure: no I/O, no imports of the
// task itself; the caller supplies the already-loaded default export.
export function validateTaskDeclaration(raw, terms = new Map()) {
  const decl = normalizeTaskDeclaration(raw);
  if (decl === null || typeof decl !== 'object' || Array.isArray(decl)) {
    return [{ what: 'task.json is not a declaration object', fix: 'write one JSON object: { "id", "description", "expected_outcome", … }' }];
  }
  const problems = [];
  const bad = (what, fix) => problems.push({ what, fix });

  if (typeof decl.id !== 'string' || decl.id.trim() === '') {
    bad('the task has no string "id"', 'give the task an "id" matching its directory name');
  }
  // Optional at the door — nothing converges a member's task files — and judged
  // only when declared; the shape check asks for one where it is missing.
  if (decl.description !== undefined) {
    const problem = descriptionProblem(decl.description);
    if (problem) bad(problem.what, problem.fix);
  }
  // `precondition_signals` is retired with the function form it belonged to
  // (#1617). The union is DERIVED from the expression's terms, each of which
  // names what it reads, so the collector can never disagree with what the gate
  // actually consults — a declared list can, and that is the whole reason the
  // derived one replaced it.
  if (decl.precondition_signals !== undefined) {
    bad('"precondition_signals" is retired', 'drop it — the signal union is derived from the conditions, each of which names what it reads');
  }
  if (!MODEL_FAMILIES.includes(decl.agent_model)) {
    bad(`"agent_model" ${JSON.stringify(decl.agent_model)} is not a legal model family`, `set one of: ${MODEL_FAMILIES.join(', ')}`);
  }
  if (!OUTCOMES.includes(decl.expected_outcome)) {
    bad(`"expected_outcome" ${JSON.stringify(decl.expected_outcome)} is not a legal outcome ceiling`, `set one of: ${OUTCOMES.join(', ')}`);
  }
  // automerge - validated as a policy SHAPE only: whether every named
  // rule resolves is the policy engine's question, answered where the diff is
  // judged, and it fails closed there — never at author time, where the rule set
  // depends on which packs are active.
  if (opensPullRequest(decl.expected_outcome)) {
    if (decl.automerge === undefined) {
      bad(`a "${decl.expected_outcome}" task declares no "automerge"`, 'say what may land unreviewed: "nothing", "anything", or a list of diff classes, e.g. ["comment-only-changes", "readme-changes"]');
    } else {
      const policy = normalizePolicy(decl.automerge);
      if (policy.kind === 'invalid') {
        bad(`"automerge" is not a legal policy: ${policy.reason}`, 'set "nothing", "anything", or a list of rule names, each optionally reject:-prefixed');
      }
    }
  } else if (decl.automerge !== undefined) {
    bad(`a "${OUTCOME_NO_PR}" task declares "automerge"`, 'drop it — a task that opens no pull request has nothing to merge; or set expected_outcome: "fresh_pr"');
  }
  // agent_instructions — REQUIRED for an agentic task (agent_model !== 'none'):
  // that's the worker file the agent reads, and it has no default. A `none` task
  // runs no agent, so the field is not applicable and is neither required nor
  // validated when present.
  if (decl.agent_model !== 'none' && (typeof decl.agent_instructions !== 'string' || decl.agent_instructions.trim() === '')) {
    bad('an agentic task (agent_model !== "none") declares no string "agent_instructions"', 'point "agent_instructions" at the worker file beside task.json (e.g. "task.md")');
  }
  // REQUIRED, and stated: who mints an occurrence is the declaration's own answer,
  // never one inferred from the shape of its conditions. The two were one field for a
  // window, and a reader could not tell a task nobody asks from one whose conditions
  // merely happened to look unaskable.
  const triggerFix = `write one of: ${TRIGGERS.map((t) => `"${t}"`).join(', ')} — "${TRIGGER_SCHEDULE}" is asked by the scheduler at every tick, "${TRIGGER_REQUEST}" runs only from an item somebody creates`;
  if (decl.trigger === undefined) {
    bad('the task declares no "trigger"', triggerFix);
  } else if (!TRIGGERS.includes(decl.trigger)) {
    bad(`"${decl.trigger}" is not a legal trigger`, triggerFix);
  }

  // ONE MECHANISM (#1617). `preconditions` — a list of named conditions, all of
  // which must hold — is the only gate a task declares. The `precondition`
  // function it replaced is retired rather than tolerated: two forms meant every
  // reader, every check and the evaluator itself had to ask which one was the
  // gate, and a task-local term does everything the function did while staying
  // pure over its inputs and testable at a chosen instant.
  //
  // A term answers three ways, not two: holds, does not hold, and `{ error }` —
  // it COULD NOT ANSWER. The third is a run failure rather than a verdict (F27):
  // a decline is a decision about the world, and one taken on an API that would
  // not answer is a guess whose write-backs cannot land.
  if (decl.precondition !== undefined) {
    bad('the task declares a "precondition" function, which is retired', 'move the gate into "preconditions" — a built-in condition, or a term this task\'s preconditions.mjs exports');
  }
  // `frequency` is retired with the calendar the scheduler used to keep: a task's
  // cadence is one of its own conditions, read off its own run history. Rejected by
  // NAME rather than ignored, and naming the term to write, so a declaration carrying
  // it is told its replacement instead of reading as a task that forgot its cadence.
  if (decl.frequency !== undefined) {
    const term = FREQUENCIES.includes(decl.frequency)
      ? cadenceTermFor(decl.frequency)
      : scheduleTermFor(`<${CADENCES.join('|')}>`);
    bad('the task declares "frequency", which is retired', term === null
      ? 'drop it and write "trigger": "request" - "manual" meant no schedule at all, which a declaration now says outright'
      : `write the cadence as a condition - "preconditions": ["${term}", …] - with "trigger": "schedule" beside it, and drop a "none"`);
  }
  // OPTIONAL (PRINCIPLES.md): a task may require nothing, and then every occurrence of
  // it runs. What is NOT read off this list is whether the scheduler asks the task —
  // `trigger` says that.
  if (decl.preconditions !== undefined) {
    for (const problem of validatePreconditions(decl.preconditions, terms)) bad(problem.what, problem.fix);
  }

  /**
   * model_from_request — OPTIONAL, and reserved to the engine's own built-in task.
   * A task that declares it runs at the model the ITEM names (`Model:`, written by
   * the scheduler run from a write-gated label), falling back to `agent_model` when the item
   * names none. It is the only field that lets anything on an item define behaviour,
   * so it is fenced rather than waved through (docs/PRINCIPLES.md, "Requests"): the shape check accepts
   * only `true`, and discovery gives pack tasks no way to be the built-in one.
   */
  if (decl.model_from_request !== undefined && decl.model_from_request !== true) {
    bad(`"model_from_request" ${JSON.stringify(decl.model_from_request)} is not \`true\``,
      'drop the field — only the engine\'s built-in request task reads a model off its item, and every other task names its own agent_model');
  }

  // Code-work (docs/PRINCIPLES.md) - OPTIONAL, and declared in one of two
  // forms. `code_worker_mjs` names the module; `code_work` names a whole command.
  // Never both: they answer the same question about the same phase, so a
  // declaration carrying each would leave which one runs to the reader.
  if (decl.code_work !== undefined && decl.code_worker_mjs !== undefined) {
    bad('both "code_work" and "code_worker_mjs" are declared', 'keep one - "code_worker_mjs" for a module the runner wraps, "code_work" for a command it only spawns');
  }
  if (decl.code_work !== undefined) {
    if (typeof decl.code_work !== 'string' || decl.code_work.trim() === '') {
      bad('"code_work" is present but not a non-empty string', 'set it to a command whose executable is a script beside task.json, e.g. "node prepare.mjs"');
    } else if (escapesTaskDir(decl.code_work)) {
      bad('"code_work" reaches outside the task directory (absolute path or "..")', 'reference a sibling script only, e.g. "node prepare.mjs"');
    }
  }
  // The WRAPPED form (owner, 2026-09-22): a module beside task.json exporting
  // `worker`, which the runner's own entry point imports and calls. What every raw
  // worker re-implemented - reading the CLAUDINITE_* environment, the exit code, the
  // failure line, the timing, the queue's markers - the runner supplies, so the
  // module is the work and nothing else. A file name, never a command: the runner
  // builds the command, and a second executable in this field would be two answers
  // to who runs the module.
  if (decl.code_worker_mjs !== undefined) {
    if (typeof decl.code_worker_mjs !== 'string' || decl.code_worker_mjs.trim() === '') {
      bad('"code_worker_mjs" is present but not a non-empty string', 'name the module beside task.json that exports `worker`, e.g. "worker.mjs"');
    } else if (/\s/.test(decl.code_worker_mjs.trim())) {
      bad('"code_worker_mjs" is a command rather than a file name', 'name the module alone, e.g. "worker.mjs" - the runner supplies the node invocation');
    } else if (!decl.code_worker_mjs.endsWith('.mjs')) {
      bad('"code_worker_mjs" does not name a .mjs module', 'the runner imports it and calls its `worker` export, so it is an ES module beside task.json');
    } else if (escapesTaskDir(decl.code_worker_mjs)) {
      bad('"code_worker_mjs" reaches outside the task directory (absolute path or "..")', 'name a sibling module only, e.g. "worker.mjs"');
    }
  }
  // Either form is a subprocess, so either carries the same hard bound.
  if (declaresCodeWork(decl)) {
    const field = decl.code_worker_mjs !== undefined ? 'code_worker_mjs' : 'code_work';
    if (!isPositiveInt(decl.code_work_timeout)) {
      bad(`"${field}" is set but "code_work_timeout" is not a positive integer`, 'add "code_work_timeout": the seconds after which the subprocess is killed and the task fails');
    } else if (decl.code_work_timeout * 1000 >= EXECUTING_LEASH_MS) {
      // F17: a code-work legally allowed to outlive the executing leash is reclaimed
      // WHILE ALIVE, and the failure is not one duplicate run but a livelock —
      // every tenure reclaimed before it can finish, code-work re-executing each
      // cycle, the occurrence never converging. The leash is the engine's, so the
      // comparison is made where a declaration is judged.
      bad(`"code_work_timeout" (${decl.code_work_timeout}s) reaches the executor's ${EXECUTING_LEASH_MS / 60e3}-minute claim leash`,
        `bound the work step under ${EXECUTING_LEASH_MS / 60e3} minutes - one that can outlive the leash is reclaimed while still running, and the item livelocks`);
    }
  }

  // --- the work-item queue's three optional declarations (docs/PRINCIPLES.md) ---

  // `schedule_after` — ordering, declared (PRINCIPLES.md). A list of `<pack>/<task>` ids this
  // task yields to WHILE THEY ARE LIVE THIS CYCLE. It compiles to the executor's
  // pick-time yield, never to a `Blocked-by` edge: a standing item that rolls
  // never closes, so blocked-by would starve every dependent of a quiet upstream
  // forever. The engine never learns what any named task does — it reads item
  // states, generically.
  if (decl.schedule_after !== undefined
      && !(Array.isArray(decl.schedule_after)
        && decl.schedule_after.every((s) => typeof s === 'string' && /^[^/\s]+\/[^/\s]+$/.test(s)))) {
    bad('"schedule_after" is not an array of "<pack>/<task>" ids', 'e.g. "schedule_after": ["claudinite-lifecycle/update"] — this task is not scheduled onto an executor while those are live this cycle');
  }

  // `on_interrupt` — the ack-early/ack-late dial (PRINCIPLES.md). Most of this fleet's
  // tasks are sweep-shaped and converge safely on a re-run, so the default is
  // `requeue`. A genuinely one-shot side effect (a store submission, an external
  // notification) declares `needs-human`, and every recovery path that would
  // re-execute it — the leash reclaim, the hand-off retry — converges to triage
  // instead: at-most-once plus a human.
  if (decl.on_interrupt !== undefined && !INTERRUPT_POLICIES.includes(decl.on_interrupt)) {
    bad(`"on_interrupt" ${JSON.stringify(decl.on_interrupt)} is not a legal policy`, `set one of: ${INTERRUPT_POLICIES.join(', ')} (default "requeue")`);
  }

  // `invocation_endpoint` — a NAME, never a URL (PRINCIPLES.md). The repo's config
  // maps the name to the URL and to the name of the Actions secret holding its
  // token, so no vendored pack file carries deployment detail or anything adjacent
  // to a credential. Reach is a property of which endpoint a task names, and of
  // nothing the task says about itself.
  if (decl.invocation_endpoint !== undefined
      && !(typeof decl.invocation_endpoint === 'string' && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(decl.invocation_endpoint))) {
    bad('"invocation_endpoint" is not a kebab-case endpoint name', 'name a key from the repo\'s taskScheduler.agenticTaskInvocationEndpoints map, e.g. "fleet" — never a URL');
  }

  // The repo Actions secrets this task's code work needs configured (PRINCIPLES.md). Purely
  // DECLARATIVE — like a pack's adoption `questions`, its job is to drive the ask
  // (adoption interactively, the scheduler by owner issue), not to gate anything
  // here. So the only shape asserted is "a list of names"; whether the repo has
  // actually configured them is a fact about the repo, answered where the secrets
  // bundle is readable, never at author time.
  if (decl.code_work_required_secrets !== undefined
      && !(Array.isArray(decl.code_work_required_secrets) && decl.code_work_required_secrets.every((s) => typeof s === 'string' && s.trim() !== ''))) {
    bad('"code_work_required_secrets" is not an array of secret names', 'list the repo Actions secret names this task needs, e.g. ["SOME_API_KEY"]');
  }

  // The one exception to "whether the repo has them is not our business": GitHub
  // reserves the `GITHUB_` prefix, answering "Secret names must not start with
  // GITHUB_" on the secret form. Such a name cannot be configured by anyone, so the
  // task parks forever on a secret its owner is refused — and only the declaration
  // can catch it, since the park reads as ordinary missing configuration.
  for (const name of (Array.isArray(decl.code_work_required_secrets) ? decl.code_work_required_secrets : [])) {
    if (typeof name === 'string' && name.toUpperCase().startsWith('GITHUB_')) {
      bad(`required secret "${name}" cannot be created — GitHub reserves the GITHUB_ prefix`,
        'rename it without that prefix, e.g. one carrying the pack\'s own name');
    }
    // The other namespace a secret cannot borrow. `CLAUDINITE_*` in a task file is the
    // code-work contract, and `task-code-work-env` reads every name outside that
    // contract as a variable nobody sets — which a delivered secret is not, so the
    // finding would be unfixable without renaming the secret anyway.
    if (typeof name === 'string' && name.toUpperCase().startsWith('CLAUDINITE_')) {
      bad(`required secret "${name}" sits in the code-work namespace, which its task's own code may not read`,
        'rename it outside CLAUDINITE_* — that prefix belongs to the variables code_work is handed');
    }
  }

  // Execution bound (docs/PRINCIPLES.md) — an agentic task MUST
  // declare a positive-integer agent_execution_timeout: there is no default,
  // because a running agent always has a bound. Enforcement is best-effort (the
  // executor surfaces the value to the subagent). A `none` task runs no agent,
  // so it needs none.
  if (MODEL_FAMILIES.includes(decl.agent_model) && decl.agent_model !== 'none' && !isPositiveInt(decl.agent_execution_timeout)) {
    bad('an agentic task (agent_model !== "none") declares no positive-integer "agent_execution_timeout"', 'add "agent_execution_timeout": the seconds bounding the agentic run — generous; extreme protection, not a scheduling knob');
  }

  // An agentless task (agent_model: none) runs no agent, so its ONLY work is
  // code-work — a `none` task with no code-work does nothing (PRINCIPLES.md, retiring
  // the in-process inline path). Require the command.
  if (decl.agent_model === 'none' && !declaresCodeWork(decl)) {
    bad('an agentless task (agent_model: "none") declares no work step', 'add "code_worker_mjs" (a none task does its work in that subprocess) - or give the task an agent_model');
  }

  return problems;
}

// The signals to collect for one task, derived from the terms its conditions
// name. There is nothing to reconcile: a declared list could disagree with what
// the gate actually consults, and the derived union cannot.
export function taskSignalNames(decl, terms = new Map()) {
  return preconditionSignals(decl?.preconditions ?? [], terms);
}
