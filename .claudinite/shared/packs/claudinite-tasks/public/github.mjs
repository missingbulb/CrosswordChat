// The GitHub client and the operations a task's worker lands its output with,
// published for every pack — and the transport this pack's own port is built on.
//
// THREE THINGS, ONE FILE, IMPORTING NOTHING:
//
//   THE TRANSPORT. `makeGh` makes `gh(path) -> { status, json }`; `restCall` is the
//   same call for a caller holding a token rather than a made client; `graphqlCall`
//   is the endpoint for the two mutations REST does not offer. Every request this pack
//   makes passes through one of the three, which is what makes the outward edge
//   countable: `apiCallCount` is the run's API spend, a property of the transport and
//   never of any caller.
//
//   THE OPERATIONS A WORKER NEEDS. `dispatchWorkflow`, and the tracker issue a
//   recurring task logs every run to (`findOrCreateTracker`, `writeTracker`). A worker
//   that needs a further REST call asks for the operation to be published rather than
//   composing a path: `src/world/github.mjs` is the port that spells every other path
//   this pack calls, and it builds on the transport here.
//
//   THE ISSUE CALLS THE TRACKER MAKES, spelled here because the tracker is here and
//   this file imports nothing — the port re-exports them, so nothing else spells them.
//
// A non-2xx returns `{ status, json: null }` rather than throwing, so a 404 is data,
// not an error. Callers that must not mistake a refusal for an answer read the STATUS —
// a 403 from a repo whose Actions cannot write puts a plausible object where the
// result should be.

const API = process.env.GITHUB_API_URL || 'https://api.github.com';

// --- how many calls this process has made ---------------------------------------
// Every REST and GraphQL request this pack makes passes through one of the three
// functions below, which is what makes the outward edge countable at all: a run's
// API spend is a property of the PORT, not of any caller, and asking each caller to
// report its own would be a second count to drift.
//
// Process-wide because a run IS a process — the scheduler and the executor each get
// a fresh one — and the cost record the run prints is about that process. A request
// that failed still counts: it was made, it was billed against the rate limit, and
// a run that spent its budget on refusals spent it.
let apiCalls = 0;

export const apiCallCount = () => apiCalls;

// For a test driving several runs through one process. Nothing in a real run calls
// it: a run that reset its own counter mid-flight would report the remainder.
export const resetApiCallCount = () => { apiCalls = 0; };

// The Action-side reader/writer. `packs/claudinite-tasks/` is the one place that
// legitimately uses the Action's `GITHUB_TOKEN` — everything session-side stays
// MCP-only (docs/PRINCIPLES.md).
//
// `path` is an API path beginning with `/` (e.g. `/repos/owner/name/commits`); the
// base URL and auth are applied here.
export function makeGh({ token = process.env.GITHUB_TOKEN, api = API, fetchImpl = fetch } = {}) {
  // `gh(path)` reads; `gh(path, { method, body })` writes (body JSON-encoded).
  return async function gh(path, { method = 'GET', body } = {}) {
    apiCalls += 1;
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
  apiCalls += 1;
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
  apiCalls += 1;
  const res = await fetchImpl(`${api}/graphql`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  return res.json().catch(() => null);
}

// --- the issue calls the tracker makes ------------------------------------------

// Replace an issue's body. The whole body, because that is the only shape the API
// offers — every caller reshapes the text it read rather than composing a new one.
export const setIssueBody = (gh, repo, number, body) =>
  gh(`/repos/${repo}/issues/${number}`, { method: 'PATCH', body: { body } });

// The raw issue PATCH and POST, for a caller that reads the status itself rather
// than taking one of the shaped writes above — the tracker, which fails soft on one
// call and loud on the next and so must see both.
export const patchIssue = (gh, repo, number, body) =>
  gh(`/repos/${repo}/issues/${number}`, { method: 'PATCH', body });

export const postIssue = (gh, repo, body) =>
  gh(`/repos/${repo}/issues`, { method: 'POST', body });

// Issue search across the repo. Search is eventually consistent and rate-limited
// separately from the REST API, which is why the callers here treat an
// unsuccessful search as "no answer" rather than "nothing found".
export const searchIssues = (gh, query) => gh(`/search/issues?q=${query}&per_page=100`);

export const comment = (gh, repo, number, body) =>
  gh(`/repos/${repo}/issues/${number}/comments`, { method: 'POST', body: { body } });

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

// --- workflow runs and Pages ------------------------------------------------------
// The reads a worker makes after a dispatch: a dispatch answers 204 and names no run,
// so the caller finds the run it started by listing the workflow's newest ones.
export const listWorkflowRuns = (gh, repo, file, { event = 'workflow_dispatch', perPage = 10 } = {}) =>
  gh(`/repos/${repo}/actions/workflows/${file}/runs?event=${event}&per_page=${perPage}`);

export const readWorkflowRun = (gh, repo, runId) => gh(`/repos/${repo}/actions/runs/${runId}`);

// The repo's GitHub Pages site — the URL a deploy answers on. 404 when Pages is off.
export const readPagesSite = (gh, repo) => gh(`/repos/${repo}/pages`);

// --- the standing tracker ----------------------------------------------------------
// A STANDING TRACKER — the one issue a recurring task logs every run to. This is a
// LIBRARY, not a phase: nothing in the scheduler knows a task has a tracker, no
// declaration carries one, and no task is expected to want one. A task that keeps
// an aggregated record calls these from its OWN code-work and passes the number to
// its agentic phase through the ordinary hand-off payload (`delivered.issue`,
// rendered into the work item by queue/code-work-run.mjs).
//
// It exists because two tasks had each grown a private copy of the same search, and
// the copies had already diverged in a way that matters — one filtered `is:open`,
// which never matches a tracker at rest and so opens a second one the moment
// anybody closes the first.
//
// TWO PROPERTIES THE LOOKUP IS SHAPED AROUND:
//
//   EXACT MATCH, NEVER THE SEARCH'S OWN RANKING. GitHub's `in:title` search is a
//   text match, so a title that is a prefix or near-twin of another task's comes
//   back too — and where sibling tasks keep sibling trackers, the top-ranked hit is
//   not reliably the right one. Every result is re-filtered on the trimmed title
//   being EQUAL to the one asked for.
//
//   A FAILED SEARCH IS NOT AN ABSENT TRACKER. `findTracker` returns null only for
//   a search that ran and matched nothing; anything else throws, because a caller
//   that treats a rate-limited search as "none exists" opens a fresh tracker on
//   every failure.
//
// Creation is deliberately a SEPARATE call. Whether a run with nothing to say
// should mint a tracker at all is the task's judgment — a sweep that found nothing
// may hold that its own scan is not news — so this module never creates as a side
// effect of looking.

// The exact-title filter, pure so the ranking question is settled in a test rather
// than against a live repo's issue list. Lowest number wins: if a past race left
// two, every later run converges on the first and the duplicate stays inert.
export function pickTracker(items, title) {
  const want = title.trim();
  const exact = (items ?? [])
    .filter((i) => (i.title ?? '').trim() === want)
    .map((i) => ({ number: i.number, state: i.state }));
  if (!exact.length) return null;
  return exact.sort((a, b) => a.number - b.number)[0];
}

// The tracker titled exactly `title`, or null if no issue carries it. Searches
// EVERY state: a tracker's resting state is closed, so a state-filtered lookup
// misses all of them.
//
// A tracker found OPEN is closed on the way back. Creation has closed since #951,
// but that only ever covered a tracker this code minted — one that predates the
// fix, or whose closing PATCH failed, had nothing anywhere that would ever look at
// its state again, so it sat open indefinitely (#904, open from 2026-08-16). The
// repair rides the lookup because every task's own run performs one, which is the
// only pass guaranteed to reach every tracker in the fleet.
export async function findTracker(gh, repo, title) {
  const want = title.trim();
  const q = encodeURIComponent(`repo:${repo} in:title "${want}"`);
  const { status, json } = await searchIssues(gh, q);
  if (status !== 200 || !Array.isArray(json?.items)) {
    throw new Error(`could not search for the tracker ${JSON.stringify(want)}: search returned ${status}`);
  }
  const exact = json.items.filter((i) => (i.title ?? '').trim() === want);
  const found = pickTracker(exact, want);
  if (!found) return null;
  // Fail-soft, and deliberately so: an unclosable tracker is untidy, never a
  // reason to fail the run that was about to write its record.
  if (found.state === 'open') {
    await patchIssue(gh, repo, found.number, { state: 'closed', state_reason: 'completed' }).catch(() => {});
  }
  return { number: found.number, duplicates: exact.length - 1 };
}

// Create the tracker and close it — TWO calls, because issue creation always lands
// an issue open and ignores a `state` argument, so the single-call version left
// every tracker open across the fleet (#951).
export async function createTracker(gh, repo, title, body = null) {
  const want = title.trim();
  const created = await postIssue(gh, repo, { title: want, body: body ?? trackerSeedBody(want) });
  if (created.status >= 300 || !created.json?.number) {
    throw new Error(`could not create the tracker ${JSON.stringify(want)}: create returned ${created.status}`);
  }
  const number = created.json.number;
  const closed = await patchIssue(gh, repo, number, { state: 'closed', state_reason: 'completed' });
  return { number, leftOpen: closed.status >= 300 };
}

// Find it, or create it — for a task that writes to its tracker on every run and
// therefore always wants one. A task whose run may have nothing to record calls
// `findTracker` alone and creates only once it has something to write.
export async function findOrCreateTracker(gh, repo, title) {
  const found = await findTracker(gh, repo, title);
  if (found) return { ...found, created: false };
  const made = await createTracker(gh, repo, title);
  return { number: made.number, duplicates: 0, created: true, leftOpen: made.leftOpen };
}

// What a freshly-created tracker says before its first run writes to it. It names
// its own contract, because whoever finds it next finds it closed and empty.
export function trackerSeedBody(title) {
  return [
    `Standing tracker for the Claudinite task that logs to **${title}**.`,
    '',
    'This issue is a living document: the **body** is rewritten to the current picture each run,',
    'and each run adds a dated comment. Its closed state carries no meaning — nothing opens,',
    'closes or reopens it, and no run should be read as "resolved" because it is closed.',
    '',
    '_No run has written here yet._',
  ].join('\n') + '\n';
}

// Write a run's state to the tracker: the BODY replaced with the current picture,
// and optionally one dated comment appended. The state is untouched, in either
// direction — the body is the live picture, the comments are the trail.
export async function writeTracker(gh, repo, number, { body, comment: note = null } = {}) {
  if (body !== undefined && body !== null) {
    const patched = await setIssueBody(gh, repo, number, body);
    if (patched.status >= 300) throw new Error(`could not refresh tracker #${number}: PATCH returned ${patched.status}`);
  }
  if (note) {
    const posted = await comment(gh, repo, number, note);
    if (posted.status >= 300) throw new Error(`could not comment on tracker #${number}: POST returned ${posted.status}`);
  }
  return number;
}
