// THE GITHUB PORT. Every REST path this pack calls is spelled in this module or in
// the published client it builds on, and nowhere else: a
// caller names the OPERATION it wants — read this issue, swap this label, merge this
// pull request — and never the URL that performs it. That is what makes the outward
// edge countable and replaceable; a module that spelled its own path would be a
// second GitHub client nothing knows about.
//
// The transport is `gh(path) -> { status, json }`, made by the client's `makeGh` and
// passed to every operation as its first argument. It stays an injected function
// rather than a bound client because the whole pack tests against a fake `gh`, and
// because the fleet planner supplies its own reader over a different token.
//
// A non-2xx returns `{ status, json: null }` rather than throwing, so a 404 (no
// release yet, missing file) is data, not an error. Callers that must not mistake
// a refusal for an answer read the STATUS — a 403 from a repo whose Actions cannot
// write puts a plausible object where the result should be.
//
// LABEL WRITES ARE GRANULAR, ALWAYS: add and remove NAMED
// labels (POST/DELETE), never write the label SET (PUT). A set-write replaces from
// a stale snapshot and clobbers concurrent transitions — a bug class GitHub's own
// CLI shipped (cli/cli#4861) — and with a scheduler run and several executors all
// moving labels at once, that is a correctness rule rather than a style preference.

import { actionsEnv } from './actions.mjs';
import { varsBag } from './vars-bag.mjs';
// The transport, the call counter and the issue calls the tracker spells for itself
// all live in the published client; this port is every OTHER path, over that
// transport, and re-exports those so every caller in this pack still names one module.
import {
  makeGh, restCall, graphqlCall, apiCallCount, resetApiCallCount,
  setIssueBody, patchIssue, postIssue, searchIssues, comment, dispatchWorkflow,
  listWorkflowRuns, readWorkflowRun, readPagesSite,
} from '../../public/github.mjs';

export {
  makeGh, restCall, graphqlCall, apiCallCount, resetApiCallCount,
  setIssueBody, patchIssue, postIssue, searchIssues, comment, dispatchWorkflow,
  listWorkflowRuns, readWorkflowRun, readPagesSite,
};

// --- issues -------------------------------------------------------------------

export const readIssue = async (gh, repo, number) => {
  const { status, json } = await gh(`/repos/${repo}/issues/${number}`);
  return status === 200 ? json : null;
};

// The same read, with the status kept — for a caller that must tell "closed" from
// "could not be read".
export const getIssue = (gh, repo, number) => gh(`/repos/${repo}/issues/${number}`);

export const setIssueTitle = (gh, repo, number, title) =>
  gh(`/repos/${repo}/issues/${number}`, { method: 'PATCH', body: { title } });

export const reopenIssue = (gh, repo, number) =>
  gh(`/repos/${repo}/issues/${number}`, { method: 'PATCH', body: { state: 'open' } });

export const closeIssue = (gh, repo, number, stateReason = 'completed') =>
  gh(`/repos/${repo}/issues/${number}`, { method: 'PATCH', body: { state: 'closed', state_reason: stateReason } });

export async function createIssue(gh, repo, { title, body, labels = [] }) {
  const { status, json } = await gh(`/repos/${repo}/issues`, { method: 'POST', body: { title, body, labels } });
  // The STATUS is read, not just the body: a 403 from a repo whose Actions cannot
  // create issues puts an error object where the issue should be, and a body-only
  // destructure turns that refusal into a plausible object whose `.number` is
  // simply undefined.
  return { status, number: status >= 200 && status < 300 ? json?.number ?? null : null, json };
}

// One page of the repo's open issues, oldest first — the order the queue reads its
// items in, so a page boundary cannot reorder them.
export const listOpenIssuesPage = (gh, repo, page) =>
  gh(`/repos/${repo}/issues?state=open&sort=created&direction=asc&per_page=100&page=${page}`);

// One page of recently closed issues, newest first — a bounded look back over
// settled items rather than the whole history.
export const listClosedIssuesPage = (gh, repo, page) =>
  gh(`/repos/${repo}/issues?state=closed&sort=updated&direction=desc&per_page=100&page=${page}`);

// The issues listing under a caller-composed query string (already encoded): the
// label/state/since filters each reader needs, without this module having to know
// every combination.
export const listIssuesByQuery = (gh, repo, query) => gh(`/repos/${repo}/issues?${query}`);

// --- labels -------------------------------------------------------------------

// Ensure every label exists before any is applied. Load-bearing, not cosmetic:
// GitHub does not create a label when you apply one (the issues API 422s on an
// unknown label), so the thing that assigns a label must guarantee it first.
// Idempotent (201 created / 422 already exists are both success) and self-healing
// — a deleted label reappears on the next run.
export async function ensureLabels(gh, repo, labels) {
  for (const { name, color, description } of labels) {
    const res = await gh(`/repos/${repo}/labels`, { method: 'POST', body: { name, color, description } });
    if (res.status === 201) continue;                       // created to spec — nothing further
    if (res.status === 422) {
      // The NAME is taken; that says nothing about the colour or description. A
      // label GitHub auto-created (applying an unknown name to an issue mints it
      // grey `ededed`, no description) would keep those defaults for good, because
      // POST 422s forever. So reconcile the shape, not just the existence — that
      // is what makes the self-healing claim above true for drift and not only for
      // deletion. PATCH is idempotent: an already-correct label is a no-op write.
      const fix = await gh(`/repos/${repo}/labels/${encodeURIComponent(name)}`, {
        method: 'PATCH', body: { color, description },
      });
      if (fix.status !== 200) console.log(`! could not reconcile label "${name}": ${fix.status}`);
      continue;
    }
    console.log(`! could not ensure label "${name}": ${res.status}`);
  }
}

export const addLabel = (gh, repo, number, name) =>
  gh(`/repos/${repo}/issues/${number}/labels`, { method: 'POST', body: { labels: [name] } });

// A label that is already absent 404s; that is the desired end state, so it is
// success. Nothing here reads the response beyond reporting it.
export const removeLabel = (gh, repo, number, name) =>
  gh(`/repos/${repo}/issues/${number}/labels/${encodeURIComponent(name)}`, { method: 'DELETE' });

// The swap every state transition makes. Remove-then-add, and NOT atomic —
// GitHub has no atomic label swap. That is safe because labels are visibility and
// the pick filter, never the arbiter (the claim comments are); what a torn swap
// CAN leave is an open item wearing no state label at all, which the repair phase
// repairs.
export async function swapLabel(gh, repo, number, from, to) {
  await removeLabel(gh, repo, number, from);
  return addLabel(gh, repo, number, to);
}

// --- comments -----------------------------------------------------------------

// The ONE sanctioned edit to a comment, and the one exception to the arbitration
// record being append-only: an executor striking its OWN claim on the way out. Only
// a claim's author ever edits it, so a claim can be
// withdrawn but never forged earlier, and comment ids still give the total order
// arbitration reads.
export const editComment = (gh, repo, commentId, body) =>
  gh(`/repos/${repo}/issues/comments/${commentId}`, { method: 'PATCH', body: { body } });

export const listComments = async (gh, repo, number) => {
  const out = [];
  for (let page = 1; ; page += 1) {
    const { status, json } = await gh(`/repos/${repo}/issues/${number}/comments?per_page=100&page=${page}`);
    if (status !== 200 || !Array.isArray(json) || json.length === 0) break;
    out.push(...json);
    if (json.length < 100) break;
  }
  return out;
};

// --- permission ---------------------------------------------------------------

// A collaborator's permission on the repo — how the queue tells an owner's word
// from a passer-by's. A non-200 is "cannot tell", never "no permission".
export const collaboratorPermission = (gh, repo, login) =>
  gh(`/repos/${repo}/collaborators/${encodeURIComponent(login)}/permission`);

// --- pull requests ------------------------------------------------------------

export const listOpenPulls = (gh, repo) => gh(`/repos/${repo}/pulls?state=open&per_page=100`);

export const readPull = (gh, repo, number) => gh(`/repos/${repo}/pulls/${number}`);

export const mergePull = (gh, repo, number, body) =>
  gh(`/repos/${repo}/pulls/${number}/merge`, { method: 'PUT', body });

export const closePull = (gh, repo, number) =>
  gh(`/repos/${repo}/pulls/${number}`, { method: 'PATCH', body: { state: 'closed' } });

// --- refs, branches and trees --------------------------------------------------

// Delete a branch ref. 204 is the success; anything else is litter left behind,
// never a failed run — the branch is not the deliverable.
export const deleteBranchRef = (gh, repo, ref) =>
  gh(`/repos/${repo}/git/refs/heads/${encodeURIComponent(ref)}`, { method: 'DELETE' });

export const readBranch = (gh, repo, branch) => gh(`/repos/${repo}/branches/${branch}`);

export const readTree = (gh, repo, ref) => gh(`/repos/${repo}/git/trees/${ref}`);

// --- commits, runs and releases --------------------------------------

export const readCommit = (gh, repo, sha) => gh(`/repos/${repo}/commits/${sha}`);

export const listRunsForSha = (gh, repo, sha) =>
  gh(`/repos/${repo}/actions/runs?head_sha=${sha}&per_page=100`);

export const latestRelease = (gh, repo) => gh(`/repos/${repo}/releases/latest`);

// A repository Actions variable, answered from the executor's vars bag in the shape the
// REST read returns. Kept at this name for a member's local pack that imports it;
// the API route itself is never asked, because the Actions GITHUB_TOKEN is refused on it
// in every member (`repo-variables-through-the-bag`).
export const readRepoVariable = async (_gh, _repo, name, env = actionsEnv()) => {
  const bag = varsBag(env);
  return bag && name in bag ? { status: 200, json: { name, value: String(bag[name]) } } : { status: 404, json: null };
};
