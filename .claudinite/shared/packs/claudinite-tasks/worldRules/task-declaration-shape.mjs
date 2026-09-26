import { finding } from '../../../engine/checks/helpers/findings.mjs';
import { stripComments } from '../../../engine/checks/helpers/code-scanning.mjs';
import { FREQUENCIES, CADENCES, scheduleTermFor, cadenceTermFor, cadenceOf } from '../src/contract/calendar.mjs';
import { MODEL_FAMILIES } from '../src/contract/model-map.mjs';
import {
  OUTCOMES, OUTCOME_NO_PR, DEFAULT_AGENT_MODEL, descriptionProblem, normalizeTaskDeclaration,
  TRIGGERS, TRIGGER_SCHEDULE, TRIGGER_REQUEST,
} from '../src/contract/task-contract.mjs';
import { validatePreconditions, termsMap, preconditionNeedsItem } from '../src/contract/precondition-policy.mjs';
import { TASK_DECLARATION_PATH_RE, readDeclarationFields } from '../src/contract/task-declaration-text.mjs';

// Every scheduler task is a `tasks/<name>/task.json` carrying the declaration
// contract with legal enum values. This
// asserts that shape statically at author time — the executor and scheduler
// validate the same contract at run time, so an illegal
// condition/model/outcome, or a missing field, is caught here first.
//
// RELEVANCE FIRST: gated on a task declaration file
// existing, so the check is inert on any repo without tasks. Static text over the
// self-contained file — a `task.json` parsed whole — keyed off the canonical enum
// lists so the legal values never drift from the runtime validator.

// The term names the task's own `preconditions.mjs` exports, read as text: the
// check runs over a file listing, not a module graph, so it recognises a
// task-local condition by the key that defines it. A term the file computes
// rather than spells is not found, and its declaration reads as unknown.
// Read as TEXT, never imported: a check must not execute a member's own module. So
// each term is its name plus the two properties of it a declaration can be wrong
// about — `needsItem`, which decides whether the term can be judged at a tick at
// all, and `takesArg`, which decides whether the declaration may carry one after
// the colon. Either quote style, because a member's file is its author's.
const TERM_NAME = /^ {2}['"]([^'"]+)['"]:/gm;
function siblingTerms(ctx, taskFile) {
  const text = ctx.read(taskFile.replace(/task\.json$/, 'preconditions.mjs'));
  if (text === null) return new Map();
  const body = stripComments(text);
  const start = body.indexOf('export const terms');
  if (start === -1) return new Map();
  const section = body.slice(start);
  const named = [...section.matchAll(TERM_NAME)];
  return termsMap(Object.fromEntries(named.map((m, i) => {
    const block = section.slice(m.index, named[i + 1]?.index ?? section.length);
    return [m[1], {
      signals: [],
      needsItem: /\bneedsItem\s*:\s*true\b/.test(block),
      takesArg: /\btakesArg\s*:\s*true\b/.test(block),
    }];
  })));
}

const rule = {
  id: 'task-declaration-shape',
  on_fail: 'block',
  description: 'A tasks/<name>/task.json carries the task contract (id, description, trigger, preconditions, expected_outcome) with legal enum values, a stated trigger saying who mints an occurrence and a well-formed precondition expression stating when the task runs; an agentic task names its worker file and bounds its run, and any code_work carries a timeout and stays task-local',
  doc: 'packs/claudinite-tasks/README.md',
  why: 'the scheduler run and executor read agent_model/expected_outcome/preconditions from this file, not the work item — an illegal or missing value means a task never fires, fires wrong, or writes past its ceiling',

  run(ctx) {
    const out = [];
    for (const file of ctx.files.filter((f) => TASK_DECLARATION_PATH_RE.test(f))) {
      const text = ctx.read(file);
      if (text === null) continue;
      const flag = (what, fix) => out.push(finding(rule, { file, what, fix }));
      const advise = (what, fix) => out.push(finding(rule, { file, on_fail: 'advise', what, fix }));

      const decl = readDeclarationFields(text);
      if (decl.error) {
        flag(`is not a JSON object: ${decl.error}`, 'write one JSON object: { "id", "description", "preconditions", "expected_outcome", … }');
        continue;
      }
      const str = (key) => (typeof decl.scalar(key) === 'string' ? decl.scalar(key) : null);
      const hasNum = (...keys) => keys.some((key) => typeof decl.scalar(key) === 'number');

      const enumField = (key, legal) => {
        const v = str(key);
        if (v === null) flag(`declares no "${key}"`, `add "${key}": one of ${legal.join(', ')}`);
        else if (!legal.includes(v)) flag(`"${key}" is "${v}", not a legal value`, `use one of: ${legal.join(', ')}`);
      };
      // `frequency` is retired: the cadence is a condition in `preconditions`, and
      // nothing reads the field. BLOCKING because the runtime contract rejects it
      // too - a declaration
      // carrying it no longer runs, so saying so at author time is the whole point.
      // Flagged by NAME rather than left unrecognised, so its author is told the term
      // to write instead of reading as a task that simply forgot its cadence.
      if (decl.has('frequency')) {
        const declared = str('frequency');
        const term = FREQUENCIES.includes(declared) ? cadenceTermFor(declared) : scheduleTermFor(`<${CADENCES.join('|')}>`);
        flag('declares "frequency", which is retired', term === null
          ? 'drop the field, and a "none" beside it, and write "trigger": "request" - "manual" meant no schedule at all'
          : `write the cadence as a condition - "preconditions": [${JSON.stringify(term)}, …] - with "trigger": "schedule" beside it, and drop a "none"`);
      }
      // `trigger` says whether the scheduler asks this task at every tick, and is
      // REQUIRED: nothing derives it from the shape of the conditions, so a
      // declaration stating none fails contract validation and the task never runs.
      // Blocking here is what turns that into an edit an author can make, at the line
      // the field goes on, rather than a silent absence from the scheduler's roster.
      //
      // Beside the value, one pairing cannot work: a `schedule` task whose expression
      // reads the ITEM has nothing to be judged against at a tick — the scheduler's
      // own ask carries no item — so the term errors on every tick and the task's lane
      // fills with failed runs rather than ever declining.
      if (!decl.has('trigger')) {
        flag('declares no "trigger"',
          `add "trigger": one of ${TRIGGERS.join(', ')}. "${TRIGGER_SCHEDULE}" is asked by the scheduler at every tick, "${TRIGGER_REQUEST}" runs only from an item somebody creates`);
      } else {
        const trigger = str('trigger');
        if (trigger === null || !TRIGGERS.includes(trigger)) {
          flag(`"trigger" is ${JSON.stringify(decl.scalar('trigger') ?? null)}, not a legal value`,
            `use one of: ${TRIGGERS.join(', ')} — "${TRIGGER_SCHEDULE}" is asked by the scheduler at every tick, "${TRIGGER_REQUEST}" runs only from an item somebody creates`);
        } else if (trigger === TRIGGER_SCHEDULE && decl.list('preconditions')
          && preconditionNeedsItem(decl.list('preconditions'), siblingTerms(ctx, file))) {
          flag('a "schedule" task states a condition that reads the item itself',
            `write "trigger": "${TRIGGER_REQUEST}" — a condition about one item can only be judged once an item exists, and the scheduler's ask at a tick has none, so this task would fail every tick instead of declining`);
        } else if (trigger === TRIGGER_REQUEST && cadenceOf(decl.list('preconditions'))) {
          // Inert, not merely redundant, which is why this blocks: nothing asks a
          // request task, so every occurrence of it is an item somebody created,
          // every such item carries `Woken:`, and a wake stands in for the cadence.
          // The term cannot decline a single run, and reads as though it could.
          flag('a "request" task states a cadence term',
            'drop the term — nothing asks this task, so every item of it is one somebody created and carries `Woken:`, which satisfies a cadence; the term can never decline a run, it only reads as though it limits the lever');
        }
      }

      // agent_model is OPTIONAL: absent means no agent, so the
      // checks below judge the model the task will actually run at.
      const declaredModel = str('agent_model');
      if (decl.has('agent_model') && (declaredModel === null || !MODEL_FAMILIES.includes(declaredModel))) {
        flag(`"agent_model" is ${JSON.stringify(decl.scalar('agent_model') ?? null)}, not a legal value`, `use one of: ${MODEL_FAMILIES.join(', ')} — or drop it: a task with no agent_model runs no agent`);
      }
      const model = declaredModel ?? DEFAULT_AGENT_MODEL;

      // expected_outcome takes the ceiling/policy split.
      const outcome = str('expected_outcome');
      const hasMayAutomerge = decl.has('automerge');
      if (outcome === null) {
        flag('declares no "expected_outcome"', `add "expected_outcome": one of ${OUTCOMES.join(', ')}`);
      } else if (!OUTCOMES.includes(outcome)) {
        flag(`"expected_outcome" is "${outcome}", not a legal value`, `use one of: ${OUTCOMES.join(', ')}`);
      }
      if (outcome === OUTCOME_NO_PR && hasMayAutomerge) {
        flag(`a "${OUTCOME_NO_PR}" task declares "automerge"`, 'drop it — a task that opens no pull request has nothing to merge; or set expected_outcome: "fresh_pr"');
      }

      if (str('id') === null) flag('declares no string "id"', 'add "id": the task name (matching its directory)');
      // ADVISORY when absent — a member's converted task carries none, and its
      // vendor refresh must not go red over it — and blocking when declared badly.
      if (!decl.has('description')) {
        advise('declares no "description"', 'add "description": up to fifty words on what the task does or why it exists — not what the other fields already say');
      } else {
        const problem = descriptionProblem(decl.scalar('description'));
        if (problem) flag(problem.what, problem.fix);
      }
      // agent_instructions is required only for an agentic task (agent_model !==
      // 'none') — that's the worker file the agent reads, and it has no default. A
      // `none` task runs no agent, so the field is not applicable.
      if (model !== 'none' && str('agent_instructions') === null) {
        flag('an agentic task (agent_model !== "none") declares no string "agent_instructions"', 'add "agent_instructions": the worker file beside the declaration (e.g. "task.md")');
      }
      // `preconditions` is the only gate a task declares (#1617). The retired
      // spelling is flagged by NAME rather than merely going unrecognised, so a
      // declaration carrying it is told what replaced it instead of reading as a
      // task that simply forgot its gate.
      if (decl.has('precondition')) {
        flag('declares "precondition", which is retired', 'move the gate into "preconditions" — a built-in condition, or a term this task\'s preconditions.mjs exports');
      }
      if (decl.has('precondition_signals')) {
        flag('declares "precondition_signals", which is retired', 'drop it — the signal union is derived from the conditions, each of which names what it reads');
      }
      // What must hold for a run, and OPTIONAL: a declaration stating none requires
      // nothing, and every occurrence of it runs. The expression is judged term by term.
      if (decl.has('preconditions')) {
        // Deliberately strict: a declaration whose conditions are computed cannot be
        // audited by anyone reading it, which is the whole reason the field is data.
        const stated = decl.list('preconditions');
        if (stated === null) {
          flag('"preconditions" is not a literal list of condition strings', 'write it as a literal, e.g. "preconditions": ["due:daily", "substantive-change"] — a computed expression is unreadable to this check and to the next person');
        } else {
          const expression = normalizeTaskDeclaration({ preconditions: stated }).preconditions;
          for (const problem of validatePreconditions(expression, siblingTerms(ctx, file))) flag(problem.what, problem.fix);
        }
      }

      // The code-work/timeout guards. Either form of the work
      // step: the runtime contract reads both through `declaresCodeWork`, and a check
      // watching one of two structurally-identical surfaces reads as strictness on
      // the other.
      const hasCodeWork = str('code_work') !== null || str('code_worker_mjs') !== null;
      // No default for the bound: a running agent always has one.
      if (model !== 'none' && !hasNum('agent_execution_timeout')) {
        flag('an agentic task (agent_model !== "none") declares no numeric "agent_execution_timeout"', 'add "agent_execution_timeout": seconds bounding the agentic run');
      }
      if (model === 'none' && !hasCodeWork) {
        flag('an agentless task (agent_model: "none") declares no work step', 'add "code_worker_mjs" (a none task does its work in that subprocess) - or give the task an agent_model');
      }
      if (str('code_work') !== null && str('code_worker_mjs') !== null) {
        flag('both "code_work" and "code_worker_mjs" are declared', 'keep one - "code_worker_mjs" for a module the runner wraps, "code_work" for a command it only spawns');
      }
      const workerModule = str('code_worker_mjs');
      if (workerModule !== null) {
        if (/\s/.test(workerModule)) {
          flag('"code_worker_mjs" is a command rather than a file name', 'name the module alone, e.g. "worker.mjs" - the runner supplies the node invocation');
        } else if (!workerModule.endsWith('.mjs')) {
          flag('"code_worker_mjs" does not name a .mjs module', 'the runner imports it and calls its `worker` export, so it is an ES module beside task.json');
        } else if (/(^|\s)\//.test(workerModule) || workerModule.includes('..')) {
          flag('"code_worker_mjs" reaches outside the task directory (absolute path or "..")', 'name a sibling module only, e.g. "worker.mjs"');
        }
      }
      if (hasCodeWork) {
        const prep = str('code_work');
        if (prep && (/(^|\s)\//.test(prep) || prep.includes('..'))) {
          flag('"code_work" reaches outside the task directory (absolute path or "..")', 'reference a sibling script only, e.g. "node prepare.mjs"');
        }
        if (!hasNum('code_work_timeout')) {
          flag('a work step is declared but no numeric "code_work_timeout" is', 'add "code_work_timeout": seconds after which the subprocess is killed');
        }
      }
    }
    return out;
  },
};

export default rule;
