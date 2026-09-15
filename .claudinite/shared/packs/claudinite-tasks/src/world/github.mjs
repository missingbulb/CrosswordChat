// THE GITHUB PORT. Every REST path this pack calls is spelled in this module and
// nowhere else: a caller names the OPERATION it wants — read this issue, swap this
// label, merge this pull request — and never the URL that performs it. That is
// what makes the outward edge countable and replaceable; a module that spelled its
// own path would be a second GitHub client nothing knows about.
//
// The transport is `gh(path) -> { status, json }`, made by `makeGh` and passed to
// every operation as its first argument. It stays an injected function rather than
// a bound client because the whole pack tests against a fake `gh`, and because the
// fleet planner supplies its own reader over a different token.
//
// A non-2xx returns `{ status, json: null }` rather than throwing, so a 404 (no
// release yet, missing file) is data, not an error. Callers that must not mistake
// a refusal for an answer read the STATUS — a 403 from a repo whose Actions cannot
// write puts a plausible object where the result should be.
//
// LABEL WRITES ARE GRANULAR, ALWAYS (docs/PRINCIPLES.md): add and remove NAMED
// labels (POST/DELETE), never write the label SET (PUT). A set-write replaces from
// a stale snapshot and clobbers concurrent transitions — a bug class GitHub's own
// CLI shipped (cli/cli#4861) — and with a scheduler run and several executors all
// moving labels at once, that is a correctness rule rather than a style preference.

const API = process.env.GITHUB_API_URL || 'https://api.github.com';

// The Action-side reader/writer. `packs/claudinite-tasks/` is the one place that
// legitimately uses the Action's `GITHUB_TOKEN` — everything session-side stays
// MCP-only (docs/PRINCIPLES.md).
//
// `path` is an API path beginning with `/` (e.g. `/repos/owner/name/commits`); the
// base URL and auth are applied here.
export function makeGh({ token = process.env.GITHUB_TOKEN, api = API, fetchImpl = fetch } = {}) {
  // `gh(path)` reads; `gh(path, { method, body })` writes (body JSON-encoded).
  return async function gh(path, { method = 'GET', body } = {}) {
    const res = await fetchImpl(`${api}${path}`, {
      method,
      headers: {
        accept: 'application/vnd.github+json',
        'x-github-api-version': '2022-11-28',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        'user-agent': 'claudinite-scheduler',
        ...(body ? { 'content-type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    let json = null;
    try { json = await res.json(); } catch { json = null; }
    return { status: res.status, json };
  };
}

// The same call for a caller that holds a token rather than a made client — the
// delivery lane, which is handed one per run. One implementation of the headers,
// so a client the landing lane uses cannot drift from the one the executor uses.
export async function restCall(token, path, { method = 'GET', body, api = API, fetchImpl = fetch } = {}) {
  const res = await fetchImpl(`${api}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/vnd.github+json',
      'x-github-api-version': '2022-11-28',
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await res.json(); } catch { /* empty body */ }
  return { status: res.status, json };
}

// The GraphQL endpoint, for the two mutations REST does not offer. Returns the
// parsed body; the caller decides what an `errors` array means.
export async function graphqlCall(token, query, variables, { api = API, fetchImpl = fetch } = {}) {
  const res = await fetchImpl(`${api}/graphql`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  return res.json().catch(() => null);
}

// --- issues -------------------------------------------------------------------

export const readIssue = async (gh, repo, number) => {
  const { status, json } = await gh(`/repos/${repo}/issues/${number}`);
  return status === 200 ? json : null;
};

// The same read, with the status kept — for a caller that must tell "closed" from
// "could not be read".
export const getIssue = (gh, repo, number) => gh(`/repos/${repo}/issues/${number}`);

// Replace an issue's body. The whole body, because that is the only shape the API
// offers — every caller reshapes the text it read rather than composing a new one.
export const setIssueBody = (gh, repo, number, body) =>
  gh(`/repos/${repo}/issues/${number}`, { method: 'PATCH', body: { body } });

export const setIssueTitle = (gh, repo, number, title) =>
  gh(`/repos/${repo}/issues/${number}`, { method: 'PATCH', body: { title } });

// The raw issue PATCH and POST, for a caller that reads the status itself rather
// than taking one of the shaped writes above — the tracker, which fails soft on one
// call and loud on the next and so must see both.
export const patchIssue = (gh, repo, number, body) =>
  gh(`/repos/${repo}/issues/${number}`, { method: 'PATCH', body });

export const reopenIssue = (gh, repo, number) =>
  gh(`/repos/${repo}/issues/${number}`, { method: 'PATCH', body: { state: 'open' } });

export const postIssue = (gh, repo, body) =>
  gh(`/repos/${repo}/issues`, { method: 'POST', body });

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

// Issue search across the repo. Search is eventually consistent and rate-limited
// separately from the REST API, which is why the callers here treat an
// unsuccessful search as "no answer" rather than "nothing found".
export const searchIssues = (gh, query) => gh(`/search/issues?q=${query}&per_page=100`);

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
// CAN leave is an open item wearing no state label at all, which the janitor
// repairs (docs/PRINCIPLES.md).
export async function swapLabel(gh, repo, number, from, to) {
  await removeLabel(gh, repo, number, from);
  return addLabel(gh, repo, number, to);
}

// --- comments -----------------------------------------------------------------

export const comment = (gh, repo, number, body) =>
  gh(`/repos/${repo}/issues/${number}/comments`, { method: 'POST', body: { body } });

// The ONE sanctioned edit to a comment, and the reason the arbitration record is
// no longer strictly append-only: an executor striking its OWN claim on the way
// out (docs/PRINCIPLES.md). Only a claim's author ever edits it, so a claim can be
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

// --- commits, runs, releases and variables --------------------------------------

export const readCommit = (gh, repo, sha) => gh(`/repos/${repo}/commits/${sha}`);

export const listRunsForSha = (gh, repo, sha) =>
  gh(`/repos/${repo}/actions/runs?head_sha=${sha}&per_page=100`);

export const latestRelease = (gh, repo) => gh(`/repos/${repo}/releases/latest`);

// A repository Actions variable — the hold lever, read live so a person can stop
// the queue without a merge.
export const readRepoVariable = (gh, repo, name) => gh(`/repos/${repo}/actions/variables/${name}`);

// --- workflows -----------------------------------------------------------------

// Fire a `workflow_dispatch`. It is how the queue CHAINS (PRINCIPLES.md) — a run
// that settled its item starts a fresh one rather than leaving the remainder for
// the cron — and `workflow_dispatch` is one of the two events the default
// `GITHUB_TOKEN` may fire, the explicit exemption in the same recursion guard that
// suppresses its label events, so no wider credential is involved.
//
// Judged by STATUS, never by the body: a token without `actions: write` 403s this
// POST with a plausible JSON body, and a body-only check would log it as sent.
export async function dispatchWorkflow(gh, repo, file, ref, inputs = null) {
  const { status } = await gh(`/repos/${repo}/actions/workflows/${file}/dispatches`, {
    method: 'POST', body: { ref, ...(inputs ? { inputs } : {}) },
  });
  return { ok: status === 204, status };
}
