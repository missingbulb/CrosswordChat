// THE RUNNER'S OWN ENTRY POINT for a task declaring `code_worker_mjs`. The runner
// already owns the subprocess - it builds the command, sets
// the environment, bounds the run and echoes the output - so it owns the entry point
// too, and a worker module holds the work and nothing else.
//
// What every worker would otherwise re-implement, and what lives here once:
//
//   - THE PARAMETERS BAG. The CLAUDINITE_* environment is read here and handed over
//     as data, so a module never touches `process.env` and can be called directly
//     from a test with a bag it built itself. The environment stays the wire -
//     nothing new crosses the process boundary - and `params` is its parsed form.
//   - THE EXIT. `process.exitCode`, never `process.exit()`: a worker's output is the
//     run's only trace, and a hard exit discards whatever the pipe has not drained.
//   - THE FAILURE LINE. A throw becomes the `<pack>/<task> failed: ...` line plus the
//     stack, and an error carrying `.triage` also prints the marker that routes the
//     park - the diagnosis a worker is the only thing able to make.
//   - THE TIMING. How long the work took, on the run's own log, where a code-work
//     creeping towards its `code_work_timeout` is visible before it is killed.
//   - THE QUEUE'S MARKERS. A returned `triage` or `requeue` becomes the marker the
//     executor reads, and a returned `requestAgent` becomes the request file. A
//     module states its verdict as a value; the protocol is written here.
//
// The module is imported rather than spawned, so it runs in this process with the
// task directory as cwd - the same containment `code_work` has.

import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { actionsEnv, taskDir as cwdTaskDir } from '../world/actions.mjs';
import { makeGh } from '../world/github.mjs';
import { nowMs } from '../world/clock.mjs';
import { policyExpression } from '../contract/merge-policy.mjs';

// The declaration beside the module. Read for the one thing the environment does not
// carry - which secrets this task asked for - rather than passed in a channel of its
// own: the module sits in its task directory, so the declaration is already here.
function taskDeclaration(taskDir) {
  try {
    return JSON.parse(readFileSync(resolve(taskDir, 'task.json'), 'utf8'));
  } catch {
    // A task whose declaration cannot be read here is one the executor validated
    // before spawning this process, so the file is present and parseable in every
    // real run; an empty one is the honest answer for the cases that are not.
    return {};
  }
}

function declaredSecretNames(decl) {
  const names = decl.code_work_required_secrets ?? decl.required_secrets;
  return Array.isArray(names) ? names.filter((n) => typeof n === 'string') : [];
}

// The bag a worker is called with. Absence is preserved rather than defaulted: a
// target this run has no pull request for reads `null`, never 0 or an empty string,
// so a module cannot mistake "not set" for a value.
export function workerParams(env, taskDir) {
  const text = (name) => (env[name] === undefined || env[name] === '' ? null : env[name]);
  const number = (name) => (text(name) === null ? null : Number(text(name)));
  const decl = taskDeclaration(taskDir);
  const secrets = {};
  for (const name of declaredSecretNames(decl)) {
    if (env[name] !== undefined) secrets[name] = env[name];
  }
  const token = text('GITHUB_TOKEN');
  const pack = text('CLAUDINITE_PACK');
  const task = text('CLAUDINITE_TASK');
  const item = { number: number('CLAUDINITE_ITEM') };
  const root = text('CLAUDINITE_REPO_ROOT');
  const repo = text('CLAUDINITE_REPO') ?? text('GITHUB_REPOSITORY');
  const base = text('CLAUDINITE_DEFAULT_BRANCH') ?? 'main';
  const target = {
    mode: text('CLAUDINITE_TARGET_MODE'),
    branch: text('CLAUDINITE_TARGET_BRANCH'),
    pr: number('CLAUDINITE_TARGET_PR'),
  };
  const log = (s) => console.log(`${task ?? 'task'}${item.number ? ` [#${item.number}]` : ''}: ${s}`);
  const bag = {
    root,
    // The executor always sets `CLAUDINITE_REPO`; the runner's own variable lets the
    // bag answer the same question outside a code-work run as inside one.
    repo,
    defaultBranch: text('CLAUDINITE_DEFAULT_BRANCH'),
    pack,
    task,
    item,
    // One entry per Context bullet: the item's binding scope, and the channel an
    // operator's parameters ride.
    context: text('CLAUDINITE_CONTEXT') === null ? [] : text('CLAUDINITE_CONTEXT').split('\n'),
    target,
    // The Action's own token, which the executor's workflow sets on every code-work
    // step. `gh` below is what a worker actually wants; the raw token stays for the
    // few that build a remote URL out of it.
    token,
    // THE REST CLIENT, READY. There is no run in which one cannot be built - the
    // executor's workflow sets `GITHUB_TOKEN` unconditionally - so a worker need not
    // check for the token. A client on a DIFFERENT credential stays the worker's own:
    // `FLEET_GITHUB_TOKEN` is a declared secret that really can be missing.
    gh: makeGh({ token }),
    log,
    // Where the runner collects the job summary a person reads on the run's page.
    // Absent outside Actions, which is a worker's cue to print instead of append.
    stepSummary: text('GITHUB_STEP_SUMMARY'),
    // What this task authorizes to land unreviewed, as the trailer's own expression,
    // for a worker that writes the arming trailer onto a commit it pushes itself.
    automerge: policyExpression(decl.automerge),
    // THE GENERATED-FILE DELIVERY, with everything the runner already knows filled
    // in. A caller passes what is its own - the files, the title, the body, the
    // commit message - and may override any of the bound arguments.
    deliver: async (opts) => {
      const { deliverGenerated } = await import('../../public/delivery.mjs');
      return deliverGenerated({ ...deliveryArguments(bag), ...opts });
    },
    secrets,
  };
  return bag;
}

// What the runner binds into a worker's `deliver`. Bound here rather than written at
// each delivery because a hand-written `'<pack>/<task>'` id goes stale on a rename
// with no error at all - the commit stops reading as machinery and starts waking every
// movement-gated task in the repo.
export const deliveryArguments = ({ root, repo, defaultBranch, token, target, pack, task, log }) => ({
  root,
  repo,
  base: defaultBranch ?? 'main',
  token,
  branch: target.branch,
  pr: target.pr,
  task: `${pack}/${task}`,
  log,
});

// A worker's returned verdict, rendered into the protocol the executor reads. Every
// key is optional, and a worker that returns nothing at all has simply done its work.
export function emitVerdict(verdict, { env = actionsEnv(), log = console.log, requestPath = null } = {}) {
  const out = verdict ?? {};
  if (out.triage) {
    const detail = out.triage.detail ? ` - ${out.triage.detail}` : '';
    log(`claudinite-needs-human: ${out.triage.kind}${detail}`);
  }
  if (out.requeue) {
    const reason = out.requeue.reason ? ` - ${out.requeue.reason}` : '';
    log(`claudinite-requeue: ${out.requeue.until}${reason}`);
  }
  if (out.requestAgent) {
    // The control signal is the file's EXISTENCE; its body carries only what the
    // named exception lets cross to the agent - what this run created, and the name
    // of the condition that woke it.
    const path = requestPath ?? env.CLAUDINITE_REQUEST_AGENT;
    if (!path) throw new Error('the worker requested the agent, but no CLAUDINITE_REQUEST_AGENT path was handed in');
    const { delivered = undefined, reason = undefined } = out.requestAgent === true ? {} : out.requestAgent;
    writeFileSync(path, JSON.stringify({ ...(delivered ? { delivered } : {}), ...(reason ? { reason } : {}) }));
  }
}

// Import the module and run it. Separated from the entry guard so a test drives the
// whole wrapping - bag, verdict, failure line, timing - without spawning node.
export async function runWorkerModule(file, {
  env = actionsEnv(), taskDir = cwdTaskDir(), log = console.log, err = console.error, now = nowMs,
} = {}) {
  const id = `${env.CLAUDINITE_PACK ?? '?'}/${env.CLAUDINITE_TASK ?? '?'}`;
  const started = now();
  try {
    const mod = await import(pathToFileURL(resolve(taskDir, file)).href);
    if (typeof mod.worker !== 'function') {
      throw new Error(`${file} exports no \`worker\` function - the runner calls that export with the parameters bag`);
    }
    const verdict = await mod.worker(workerParams(env, taskDir));
    emitVerdict(verdict, { env, log });
    log(`${id}: worker done in ${((now() - started) / 1000).toFixed(1)}s`);
    // A triage verdict IS a failed run. The executor reads the marker only off a
    // non-zero exit - a worker that could park itself on a clean one would be
    // downgrading its own failure into a lane nobody watches - so a worker asking
    // for the park exits the way that park is reached.
    return { ok: !verdict?.triage };
  } catch (e) {
    // The worker's own diagnosis, where it made one: the executor reads an exit code
    // and cannot tell a missing scope from a bug in the module.
    if (e?.triage) err(`claudinite-needs-human: ${e.triage} - ${e.message}`);
    err(`${id} failed after ${((now() - started) / 1000).toFixed(1)}s: ${e?.message ?? e}`);
    if (e?.stack) err(e.stack);
    return { ok: false };
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const file = process.argv[2];
  if (!file) {
    console.error('worker-entry: the module to run is the first argument - the runner passes the task\'s code_worker_mjs');
    process.exitCode = 2;
  } else {
    // Started rather than awaited at the top level: a module under `packs/` may not
    // hold the evaluation open, and the exit code is set from the settled promise.
    runWorkerModule(file).then(({ ok }) => { if (!ok) process.exitCode = 1; });
  }
}
