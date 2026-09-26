// The delivery lane, published for every pack: how a task's output becomes a landed
// pull request or a regenerated file, honoring the repo's delivery settings.
//
// TWO HALVES. `deliverGenerated` and its helpers are DEFINED here — the write half of
// an agentless task whose whole output is a regenerated file, which this pack's own
// fold workers and any other pack's use alike. The landing names below it are the
// executor's own lane, re-exported for a worker that lands its own pull request the
// way the executor would.
//
// The update runner's own delivery is deliberately NOT folded in here: it commits a
// whole working tree from a checkout it converged in place, a different job that
// happens to end in a PR too. What the two share, landing the PR, both take from the
// executor's lane.
//
// Two properties everything here is shaped around:
//
//   NOTHING TOUCHES THE CHECKOUT. One executor run drains several items from ONE
//   checkout, so a task that checks a branch out hands the next one a tree it did not
//   expect.
//   Every write goes through git plumbing (hash-object / read-tree into a throwaway
//   index / write-tree / commit-tree / push), against the fetched base tip — HEAD,
//   the index and the working tree are never touched, and there is nothing to clean
//   up if the run dies.
//
//   THE BASE IS THE ONLY AUTHORITY. Both the prior state a generator reads and the
//   tree it builds on come from the remote base branch, never from local HEAD. A
//   previous run's PR still sitting open is simply rebuilt from the base, so a
//   stateless generator stays idempotent no matter how many runs stack up. The
//   member's delivery preference is read from the base too, for the same reason.
//
// Idempotence is the caller's to keep: pass files whose content is a pure function of
// the inputs, and compare against `readAt` the `baseTip` before calling - an identical
// recompute should open nothing at all.

import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deliveryForText, pullCreateError, landDelivery } from '../src/deliver/land-pr.mjs';
import { SETTINGS_FILE } from '../../../engine/settings-file.mjs';
import { withTaskTrailer, taskFromMessage } from './work-item-grammar.mjs';
import { restCall } from './github.mjs';
import { runGit } from '../src/world/processes.mjs';
import { nowMs } from '../src/world/clock.mjs';
import { actionsEnv } from '../src/world/actions.mjs';

const git = (root, args, opts = {}) => runGit(['-C', root, ...args], opts);

const gh = (token, path, opts) => restCall(token, path, opts);

export const remoteUrl = (repo, token) => `https://x-access-token:${token}@github.com/${repo}.git`;

// The base branch's remote tip, fetched into this checkout's object store. Read from
// the REMOTE, never from HEAD — see the header.
export function baseTip(root, remote, base) {
  git(root, ['fetch', '--quiet', remote, base]);
  return git(root, ['rev-parse', 'FETCH_HEAD']).trim();
}

// One file's content at a commit, or null when the path does not exist there.
export function readAt(root, sha, path) {
  try { return git(root, ['show', `${sha}:${path}`]); } catch { return null; }
}

// A ROLLING file's prior state - one whose next version is folded from its last, so
// losing it loses history. Read at `path`, or at `legacyPath` where the file has not
// moved yet; `moves` is what to hand `pushGenerated` so the old bytes arrive at the new
// path before the fold writes on top of them.
export function readRollingAt(root, sha, path, legacyPath = null) {
  const text = readAt(root, sha, path);
  if (text !== null || !legacyPath) return { text, moves: {} };
  const legacy = readAt(root, sha, legacyPath);
  return legacy === null ? { text: null, moves: {} } : { text: legacy, moves: { [legacyPath]: path } };
}

// Commit `files` ({ path: content }) onto the base tip and push to `branch`,
// force — the content is regenerated wholesale each run, so the branch is a
// regenerate-not-reconcile surface.
//
// `moves` ({ from: to }) relocates a file whose data the new content is folded from.
// Each move whose `from` is on the base and whose `to` is not lands as its OWN commit
// first, the blob unchanged, so the history shows a pure rename carrying every byte
// the old path held, and the `files` commit on top is an ordinary regeneration. A move
// whose target already exists is skipped and the old file left where it is: nothing
// here removes data that did not arrive at the new path intact.
export function pushGenerated(root, { remote, baseSha, branch, files, message, moves = {} }) {
  const index = join(tmpdir(), `claudinite-deliver-${process.pid}-${nowMs()}.index`);
  const plumb = (args, opts) => git(root, args, { ...opts, env: { ...actionsEnv(), GIT_INDEX_FILE: index } });
  const commitTree = (parent, msg) => git(root, [
    '-c', 'user.name=claudinite[bot]', '-c', 'user.email=claudinite@users.noreply.github.com',
    'commit-tree', plumb(['write-tree']).trim(), '-p', parent, '-m', msg,
  ]).trim();
  try {
    plumb(['read-tree', baseSha]);
    let parent = baseSha;
    const moved = [];
    for (const [from, to] of Object.entries(moves)) {
      const blob = blobAt(root, baseSha, from);
      if (!blob || blobAt(root, baseSha, to)) continue;
      plumb(['update-index', '--add', '--cacheinfo', `100644,${blob},${to}`]);
      plumb(['update-index', '--force-remove', from]);
      moved.push(`${from} -> ${to}`);
    }
    if (moved.length) {
      parent = commitTree(parent, withTrailerOf(message, `Move ${moved.length === 1 ? 'a rolling file' : 'rolling files'} to their new home, content unchanged\n\n${moved.join('\n')}`));
    }
    for (const [path, content] of Object.entries(files)) {
      const blob = git(root, ['hash-object', '-w', '--stdin'], { input: content }).trim();
      plumb(['update-index', '--add', '--cacheinfo', `100644,${blob},${path}`]);
    }
    const commit = commitTree(parent, message);
    git(root, ['push', '--quiet', '--force', remote, `${commit}:refs/heads/${branch}`]);
    return commit;
  } finally { rmSync(index, { force: true }); }
}

// A path's blob id at a commit, or null when the path does not exist there.
function blobAt(root, sha, path) {
  try { return git(root, ['rev-parse', '--verify', '--quiet', `${sha}:${path}`]).trim() || null; } catch { return null; }
}

// The move commit carries the same task trailer as the message it precedes, so the
// movement signals classify it as machinery too.
const withTrailerOf = (message, subject) => withTaskTrailer(subject, taskFromMessage(message));

// Which branch the regenerate lands on and which pull request it updates — THE
// EXECUTOR'S DECISION, handed in: `branch` is the one it resolved, `pr` the open pull
// request it said to amend, or null for a fresh one on that branch. A named pull request the open list no longer carries was
// closed under the run; the branch is still the one to push to, and a new pull
// request opens on it.
//
// The branch is REQUIRED: an outcome that opens a pull request always resolves one, so
// an absent branch is a caller the executor is not driving, and delivering on a branch
// nothing is watching is worse than saying so.
export function generatedTarget({ pulls, branch = null, pr = null }) {
  if (!branch) {
    throw new Error('no branch to deliver on — the executor resolves it and hands it in as CLAUDINITE_TARGET_BRANCH');
  }
  const open = Array.isArray(pulls) ? pulls : [];
  const named = pr == null ? null : open.find((p) => p.number === Number(pr)) ?? null;
  return { branch, pr: named, reused: Boolean(named) };
}

// Deliver `files` on a PR that lands itself where the member allows it, on the
// branch and pull request the executor resolved (`branch`, `pr` — see
// `generatedTarget`): amending an open pull request updates it in place, so a
// daily regenerate that runs before yesterday's merged does not stack a second one.
//
// How the PR lands is the landing lane's business, not the calling task's. A PR this
// run could not land stays open - the next run rebuilds it from the base, so nothing
// is lost.
//
// Returns { branch, number, reused, delivery, merged }.
export async function deliverGenerated({ root, repo, base, token, branch: targetBranch = null, pr: targetPr = null, files, moves = {}, title, body, message, task = null, log = console.log }) {
  const { json: pulls } = await gh(token, `/repos/${repo}/pulls?state=open&per_page=100`);
  const chosen = generatedTarget({ pulls, branch: targetBranch, pr: targetPr });
  let { pr } = chosen;
  const { branch, reused } = chosen;
  const remote = remoteUrl(repo, token);

  const baseSha = baseTip(root, remote, base);
  // The member's delivery override gates everything after the push, read from the
  // BASE tip.
  const settingsText = readAt(root, baseSha, SETTINGS_FILE);
  const delivery = deliveryForText(settingsText);

  // Every commit this lane writes says which task wrote it. That trailer is what
  // the movement signals classify as machinery rather than the project moving, so
  // one task's delivery can never be the activity that wakes another.
  const commit = pushGenerated(root, { remote, baseSha, branch, files, moves, message: withTaskTrailer(message, task) });

  if (!reused) {
    const created = await gh(token, `/repos/${repo}/pulls`, { method: 'POST', body: { head: branch, base, title, body } });
    const failure = pullCreateError(created.status, created.json);
    if (failure) throw new Error(`opening the pull request for ${branch}: ${failure}`);
    pr = created.json;
  }

  let merged = false;
  if (pr?.number) {
    // Runs for review members too: a GITHUB_TOKEN push emits no pull_request run,
    // and the owner reviews against a green (#565).
    // The head sha must be THIS run's commit: a reused PR's listing still carries
    // the previous push, and polling a stale sha waits on runs that never come.
    const landed = await landDelivery({
      token, repo, base, delivery, log, task,
      pr: { ...pr, head: { ...pr.head, ref: branch, sha: commit } },
    });
    merged = landed.merged;
  }
  return { branch, number: pr?.number ?? null, reused, delivery, merged };
}

// --- the landing lane, re-exported -----------------------------------------------
export {
  deliveryFor, landDelivery, pullCreateError,
} from '../src/deliver/land-pr.mjs';
