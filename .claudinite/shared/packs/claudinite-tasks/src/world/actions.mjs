// THE GITHUB ACTIONS PORT — the runner's environment, named. Everything the
// scheduler and the executor learn from the job they are running inside comes
// through here: which repository and branch, which run, which of our own
// variables the workflow passed down, where the checkout is, and the one channel
// a step has for handing a value to the next one.
//
// Why it is a port rather than `process.env` at the call site: the names are the
// platform's, not ours, and a run driven by a simulator has no runner at all. One
// module knowing `GITHUB_REPOSITORY`, `GITHUB_RUN_ID` and `GITHUB_OUTPUT` is what
// lets every other module say what it needs instead of where it comes from.

import { appendFileSync } from 'node:fs';
import { SCHEDULER_WORKFLOW_FILE, EXECUTOR_WORKFLOW_FILE } from '../../public/task-constants.mjs';

// The raw environment, for the modules that take an `env` object and read a name
// the caller chose (a task's declared secrets, an endpoint's token). They ask for
// the bag rather than reaching for the global, so a fake environment is one
// argument away everywhere the bag is threaded.
export const actionsEnv = () => process.env;

// The checkout the job is running in. The scheduler, the executor and the
// converge all run Action-side inside the repository, so the working directory is
// the tree they read tasks and config from.
export const repoRoot = () => process.cwd();

// The two workflow files, by name — vocabulary, so they are defined with the rest of it.
export { SCHEDULER_WORKFLOW_FILE, EXECUTOR_WORKFLOW_FILE };

// The repo slug (owner/name) and default branch the workflow runs against.
// `GITHUB_REPOSITORY` is always set in a workflow; `GITHUB_REF_NAME` is the
// branch for a scheduled/dispatch run on the default branch.
export function actionRepoContext(env = process.env) {
  return {
    repo: env.GITHUB_REPOSITORY || null,
    defaultBranch: env.GITHUB_REF_NAME || 'main',
  };
}

// The URL of the run doing the reporting, or null outside Actions.
export const runUrl = (env = process.env) => (env.GITHUB_RUN_ID
  ? `${env.GITHUB_SERVER_URL ?? 'https://github.com'}/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}`
  : null);

// This run's URL for an arbitrary repo slug — the executor stamps its own run on
// items in the repo it is draining, which is the repo it runs in, but it holds
// the slug already and should not have to trust the environment for both halves.
export const runUrlFor = (repo, env = process.env) => (env.GITHUB_RUN_ID
  ? `${env.GITHUB_SERVER_URL ?? 'https://github.com'}/${repo}/actions/runs/${env.GITHUB_RUN_ID}`
  : null);

// Who is claiming an item. A run id makes the claim traceable back to the job
// that made it; `local` is the hand-run case, which arbitration treats as any
// other actor.
export const executorId = (env = process.env) => env.CLAUDINITE_EXECUTOR_ID
  || `actions-${env.GITHUB_RUN_ID ?? 'local'}`;

// A step output, for the next step's `if:`. Outside Actions there is no output
// file and nothing to write — a hand-run scheduler run simply has no consumer.
export function setStepOutput(name, value, env = process.env) {
  const out = env.GITHUB_OUTPUT;
  if (!out) return false;
  appendFileSync(out, `${name}=${value}\n`);
  return true;
}
