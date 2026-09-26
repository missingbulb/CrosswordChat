// Scheduling wiring: the two workflow files a repo running scheduled work carries, and
// the per-repo cron they are stamped with. They belong to this pack rather than the
// engine's distribution wiring because a repo that declares no tasks pack carries
// neither file.
//
// SCAFFOLDED, NEVER CONVERGED. `.github/workflows/` is the one directory a member's
// nightly may not push to — the Action's own GITHUB_TOKEN is refused there — so these
// two files arrive once, at adoption (bootstrap when the pack is declared at init, the
// adopt-pack skill after), and the repo owns them from that moment. That is affordable
// because their content is static: secrets travel as one fixed line, the cron minute and
// anchor hours are written once here, and every `run:` names a mount path behind which
// the code updates nightly.

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { hashedCron, isSchedulerCron } from './hash-minute.mjs';
import { loadConfig, ENDPOINTS_KEY } from '../../../../engine/checks/helpers/repo-context.mjs';
import { actionsEnv, repoRoot } from '../world/actions.mjs';

export const SCHEDULER_WORKFLOW = '.github/workflows/claudinite-scheduler.yml';
// The queue's second workflow. The scheduler workflow holds both the scheduler run and
// its drain, so the repo has exactly one cron at one well-known path.
export const EXECUTOR_WORKFLOW = '.github/workflows/claudinite-executor.yml';
// Endpoint tokens ride the same rail as a task's declared secrets: the config maps an endpoint name to a URL and to the NAME of the Actions
// secret holding its token, and the stamp puts that name in the executor's env
// exactly as a `code_work_required_secrets` entry. The executor reads it only at the
// moment of the invocation call; nothing else in a task's life ever sees it.
export function endpointTokenSecrets(config) {
  return Object.values(config?.taskScheduler?.[ENDPOINTS_KEY] ?? {})
    .map((e) => e?.tokenSecret).filter((n) => typeof n === 'string' && n);
}

// The repo Actions secrets a set of task declarations ask the executor to carry,
// deduped and sorted. Sync and pure over declarations already in hand, so a check —
// which runs synchronously and cannot await discovery — computes the same expectation
// the converge writes rather than a second opinion of it. This half is the one the
// `executor-workflow-secrets` check holds a member to: the tasks its packs contribute
// are what the owner's list is, and an endpoint's token is config rather than a task's
// declaration (the invocation call names its own missing token).
export function taskSecretNames(taskDeclarations) {
  return [...new Set(taskDeclarations.flatMap((decl) => decl?.code_work_required_secrets ?? []))].sort();
}

// That list plus the endpoint tokens the config names — everything the stamp writes.
export function secretNames(taskDeclarations, config) {
  return [...new Set([...taskSecretNames(taskDeclarations), ...endpointTokenSecrets(config)])].sort();
}

// The same list, discovered from the tree.
export async function declaredSecrets(root, config) {
  const { discoverTasks } = await import('../contract/discover.mjs');
  const { tasks } = await discoverTasks(root, config);
  return secretNames(tasks.map((t) => t.decl), config);
}

// Stamp the declared secrets into the executor's work step, beside GITHUB_TOKEN.
// Actions requires each secret to be named statically in the workflow, and a task's
// `code_work_required_secrets` is exactly that list — so the converge writes it and a worker
// reads `process.env.<NAME>` like any other variable. Regenerated from the stub each
// time, so the list tracks the declarations rather than accumulating.
//
// WHY NOT ONE `toJSON(secrets)` LINE. Because that is what GitHub's
// malicious-workflow detection flags (#1336): the run parks with zero jobs until a
// person approves it, which an unattended queue can neither absorb nor notice. The
// cost is real and known - the file becomes a function of the task set, and `.github/workflows/` is the one path an update cannot write, so a
// NEW secret needs a human-merged PR in every member (#1296). That is the trade the
// owner took: a rare human-merged PR beats a permanent human click on every run.
//
// A stub says WHERE with the `# claudinite:secrets` marker. Marker or nothing: the
// scheduler-run stub carries no marker and must not be stamped — it has two jobs
// carrying GITHUB_TOKEN and only the executing one may ever see a secret, and its
// drain dispatches the executor rather than running task code.
export const SECRETS_MARKER = /^[ \t]*# claudinite:secrets\b.*$/m;

// The env line one secret travels on, and the read of it. The stamp writes these
// lines and the `executor-workflow-secrets` check reads them back, so the two cannot
// disagree about what "the executor passes this secret" looks like. A name that is
// not a legal Actions secret name matches nothing rather than reaching the regex.
export const secretEnvLine = (name) => `          ${name}: \${{ secrets.${name} }}`;
export function passesSecret(workflowText, name) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) return false;
  return new RegExp(`^[ \\t]*${name}:[ \\t]*\\$\\{\\{[ \\t]*secrets\\.${name}[ \\t]*\\}\\}[ \\t]*$`, 'm').test(workflowText);
}

// A name the stub already passes on a static line is not stamped again: Actions
// refuses a workflow whose env names one key twice.
export function withDeclaredSecrets(stubText, names = []) {
  const stamped = names.filter((name) => !passesSecret(stubText, name));
  if (!stamped.length) return stubText;
  const lines = stamped.map(secretEnvLine).join('\n');
  return SECRETS_MARKER.test(stubText)
    ? stubText.replace(SECRETS_MARKER, (m) => `${m}\n${lines}`)
    : stubText;
}

// THE CRON IS THE REPO'S, WRITTEN ONCE. `current` is the workflow file already on
// disk, or null where this is the scaffold. A cron that repo already carries is kept
// verbatim; only a repo that has none, or one whose line is not a scheduler cron at
// all, gets the hashed default. Restamping it would be a change to
// `.github/workflows/`, which lands only through a pull request a person merges, so a
// converge that rewrote the line would put every member's scheduler behind a human
// gate on every change to the derivation.
export function schedulerWorkflowTarget(fullName, stubText, secretNames = [], current = null) {
  const existing = /cron:\s*'([^']*)'/.exec(current ?? '')?.[1];
  const cron = isSchedulerCron(existing) ? existing : hashedCron(fullName);
  return withDeclaredSecrets(stubText, secretNames).replace(/cron:\s*'[^']*'/, `cron: '${cron}'`);
}

export function convergeSchedulerWorkflow(root, fullName, stubText, secretNames = []) {
  const path = join(root, SCHEDULER_WORKFLOW);
  const current = existsSync(path) ? readFileSync(path, 'utf8') : null;
  return writeWorkflow(root, SCHEDULER_WORKFLOW,
    schedulerWorkflowTarget(fullName, stubText, secretNames, current));
}

// The queue's second workflow, the label-event executor. No cron of its own (the
// scheduler run's drain is the poll), so nothing about it is hashed; it only needs its
// secrets stamped.
export function convergeExecutorWorkflow(root, stubText, secretNames = []) {
  return writeWorkflow(root, EXECUTOR_WORKFLOW, withDeclaredSecrets(stubText, secretNames));
}

function writeWorkflow(root, relPath, target) {
  const path = join(root, relPath);
  const current = existsSync(path) ? readFileSync(path, 'utf8') : null;
  if (current === target) return false;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, target);
  return true;
}

// Both files at once, from the stubs in the mount this pack was read out of. The
// scheduler run and the executor have to arrive together: the drain the first one
// starts dispatches the second, so a repo holding one without the other has a queue
// that fills and never empties.
export function convergeWorkflows(root, fullName, { schedulerStub, executorStub = null, secretNames = [] } = {}) {
  const changed = [];
  if (convergeSchedulerWorkflow(root, fullName, schedulerStub, secretNames)) changed.push(SCHEDULER_WORKFLOW);
  if (executorStub && convergeExecutorWorkflow(root, executorStub, secretNames)) changed.push(EXECUTOR_WORKFLOW);
  return { changed };
}

// Where this pack's stubs sit relative to a repo root: the mount for a member, the tree
// itself for the canon. The mount is probed first because a member has both shapes on
// disk only in the canon home, where the repo root is the right answer.
export function stubsDir(root) {
  const mounted = join(root, '.claudinite/shared/packs/claudinite-tasks/stubs');
  return existsSync(mounted) ? mounted : join(root, 'packs/claudinite-tasks/stubs');
}

// CLI: `node converge-workflows.mjs [owner/repo]` — scaffold THIS repo's two workflow
// files. The full name comes from argv or GITHUB_REPOSITORY/CLAUDINITE_REPO, and the
// cron is whatever the repo already carries, or one derived from that name at scaffold.
// Exported because `converge-workflows.mjs` at the pack root runs it: `adopt-pack`'s own
// prose, and the copies members took of it, still address this command at that path.
export async function runConvergeWorkflows() {
  const argv = process.argv.slice(2);
  const fullName = argv.find((a) => !a.startsWith('--')) || actionsEnv().GITHUB_REPOSITORY || actionsEnv().CLAUDINITE_REPO;
  if (!fullName) { console.error('converge-workflows: need owner/repo (argv or GITHUB_REPOSITORY)'); process.exitCode = 1; return; }
  const root = actionsEnv().CLAUDINITE_REPO_ROOT || repoRoot();
  const stubs = stubsDir(root);
  const stubPath = join(stubs, 'claudinite-scheduler.yml');
  if (!existsSync(stubPath)) { console.error(`converge-workflows: vendored stub not found at ${stubPath}`); process.exitCode = 1; return; }
  const executorPath = join(stubs, 'claudinite-executor.yml');
  const config = loadConfig(root);
  const { changed } = convergeWorkflows(root, fullName, {
    schedulerStub: readFileSync(stubPath, 'utf8'),
    executorStub: existsSync(executorPath) ? readFileSync(executorPath, 'utf8') : null,
    secretNames: await declaredSecrets(root, config),
  });
  console.log(changed.length ? `converge-workflows: ${changed.join(', ')}` : 'converge-workflows: already converged');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) runConvergeWorkflows();
