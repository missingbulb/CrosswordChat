// The tasks fold's FIRST source: what each run of the machinery cost.
//
// The run LISTINGS are not re-derived here — `readRuns` in the session fold's own
// task folder already reads exactly this source, two calls flat however many runs
// are in the window, and a second implementation of the same listing is a second
// thing to drift. What this module adds is the two reads that listing cannot make:
//
//   - THE JOBS LISTING, one call per run, because Actions bills per JOB and the run
//     listing carries no job timings at all. A run's billed minutes are the sum over
//     its jobs of each job's wall time rounded up to a whole minute.
//   - THE JOB LOG, for a SCHEDULER run only. A tick owns no work item, so the
//     `claudinite-run-cost` record it printed exists nowhere but its log. An
//     executor run's record rides the items it settled, which the item reader picks
//     up for free.
//
// THE BUDGET, stated here because it is the reason the module is shaped this way.
// Per fold: 2 run listings, flat; 1 jobs listing per run this fold is seeing for the
// first time; and, for at most `SCHEDULER_RUNS_PER_FOLD` scheduler runs, at most
// `JOB_LOGS_PER_RUN` log reads each. On this repo's cadence — the scheduler's two
// ticks a day and the executor runs a quiet queue dispatches — that is under ten
// calls a day, which `test/tasks/tasks-usage-fold/read-run-costs.test.mjs` asserts
// by counting the fetches a representative day makes.
//
// `MAX_RUN_READS` is the runaway guard rather than the budget: a day that somehow
// produced hundreds of runs stops at the cap, leaves the watermark at the last run
// fully read, and says so — the next fold continues from exactly there. Reading a
// repo's whole rate limit to measure it would be the fold costing more than the
// thing it measures.
//
// FAIL-SOFT per read, like every source in both folds: a jobs listing that cannot be
// read costs that run its minutes and nothing else, and a log that cannot be read
// costs that tick its cost record. Neither takes the run counts down with it.

import { makeReader as makeJsonReader, readRuns, WATCHED_WORKFLOWS } from '../usage-fold/read-runs.mjs';
import { parseRunCosts } from '../../src/items/run-record.mjs';

const API = process.env.GITHUB_API_URL || 'https://api.github.com';

// At most this many scheduler runs have their log read in one fold — the two ticks
// a day the cron fires, plus one fold's slack for a late fire.
export const SCHEDULER_RUNS_PER_FOLD = 2;

// Within one of those runs, at most this many job logs are read. A tick's record is
// printed by the run job, which the jobs listing returns first; the second read
// exists for a member whose workflow orders its jobs the other way. Skipped jobs are
// never read — they have no log.
export const JOB_LOGS_PER_RUN = 2;

// The runaway guard on per-run reads in one fold. Not the budget — see the header.
export const MAX_RUN_READS = 40;

// The reader this module needs: JSON like the session fold's, plus text for a log.
// `fetchImpl` is injected so the tests drive it without a network.
export function makeReader({ token = process.env.GITHUB_TOKEN, api = API, fetchImpl = fetch } = {}) {
  const headers = {
    accept: 'application/vnd.github+json',
    'x-github-api-version': '2022-11-28',
    'user-agent': 'claudinite-tasks-usage-fold',
    ...(token ? { authorization: `Bearer ${token}` } : {}),
  };
  const { json } = makeJsonReader({ token, api, fetchImpl });
  return {
    json,
    async text(path) {
      // The logs endpoint answers a redirect to a blob; `fetch` follows it, and a
      // run whose logs have aged out of retention answers 404 — which is an ANSWER,
      // not a failure: that tick's cost is simply unrecoverable now.
      const res = await fetchImpl(`${api}${path}`, { headers });
      if (res.status !== 200) return null;
      try { return await res.text(); } catch { return null; }
    },
  };
}

// HOW A JOB'S MINUTES ARE COUNTED. Each job's wall time — `completed_at` minus
// `started_at` — rounded UP to a whole minute, summed over the run's jobs.
//
// THE ROUNDING RULE IS UNVERIFIED FROM HERE. #1872 asks for it to be checked against
// GitHub's billing documentation and cited; a session in this repo cannot reach
// `docs.github.com` at all (the egress proxy refuses the domain), so the rule below
// is the one this repo already states for itself in `src/execute/loop.mjs` —
// "Actions bills each job's runtime rounded UP to the next minute" — and not a
// reading of the docs. Confirming it against
// docs.github.com/en/billing/concepts/product-billing/github-actions needs an
// unblocked environment, and this function is the only place the rule is encoded.
//
// A job with no `completed_at` (still running, or killed without one) contributes
// NO minutes rather than zero, and the run's total is absent when no job could be
// measured at all — unknown is a state of its own here as everywhere else.
export function billedMinutes(jobs) {
  let minutes = null;
  for (const job of jobs ?? []) {
    const from = Date.parse(job?.started_at ?? '');
    const to = Date.parse(job?.completed_at ?? '');
    if (!Number.isFinite(from) || !Number.isFinite(to) || to < from) continue;
    minutes = (minutes ?? 0) + Math.ceil((to - from) / 60000);
  }
  return minutes;
}

// One run's jobs, or null when the listing could not be read.
export async function readJobs(reader, repo, runId) {
  const json = await reader.json(`/repos/${repo}/actions/runs/${runId}/jobs?per_page=100`);
  return Array.isArray(json?.jobs) ? json.jobs : null;
}

// A job that produced a log at all. A skipped job has none, and asking for one
// spends a call on a 404.
const ran = (job) => job?.conclusion !== 'skipped' && job?.conclusion != null;

// The cost record a scheduler tick printed, out of its jobs' logs. Reads at most
// `budget` of them, stopping at the first that carries one.
export async function readCostFromLog(reader, repo, jobs, { budget = JOB_LOGS_PER_RUN } = {}) {
  let reads = 0;
  for (const job of (jobs ?? []).filter(ran)) {
    if (reads >= budget) break;
    reads += 1;
    const text = await reader.text(`/repos/${repo}/actions/jobs/${job.id}/logs`);
    // The LAST record in the log, not the first: a tick prints its record once, at
    // the end, and a log that somehow carries two is a re-run whose later line is
    // the one that describes the whole of it.
    const found = parseRunCosts(text).at(-1);
    if (found) return { record: found, reads };
  }
  return { record: null, reads };
}

// The whole read: `{ runs, watermark, error?, truncated }`.
//
//   runs      — [{ id, startedAt, workflow, conclusion, jobs, minutesBilled, cost }],
//               oldest first. `jobs` is a count and `minutesBilled` a number, each
//               null where the jobs listing could not be read; `cost` is the parsed
//               `claudinite-run-cost` record for a scheduler tick whose log carried
//               one, null otherwise (an executor's arrives with its items).
//   watermark — the newest run START this fold read IN FULL. A run the cap stopped
//               before leaves the mark behind it, so the next fold re-reads exactly
//               what it missed.
export async function readRunCosts({ reader, repo, since, now, maxRunReads = MAX_RUN_READS }) {
  const listed = await readRuns({ reader, repo, since, now });
  if (listed.error) return { runs: [], watermark: listed.watermark, error: listed.error, truncated: false };

  const out = [];
  let reads = 0;
  let schedulerLogsRead = 0;
  let truncated = false;
  let watermark = since ?? null;

  for (const run of listed.runs) {
    if (reads >= maxRunReads) { truncated = true; break; }
    reads += 1;
    const jobs = await readJobs(reader, repo, run.id);
    let cost = null;
    if (run.workflow === 'scheduler' && jobs && schedulerLogsRead < SCHEDULER_RUNS_PER_FOLD) {
      schedulerLogsRead += 1;
      const read = await readCostFromLog(reader, repo, jobs);
      reads += read.reads;
      cost = read.record;
    }
    out.push({
      id: run.id,
      startedAt: run.startedAt,
      workflow: run.workflow,
      conclusion: run.conclusion,
      jobs: jobs ? jobs.length : null,
      minutesBilled: jobs ? billedMinutes(jobs) : null,
      cost,
    });
    watermark = run.startedAt;
  }
  return { runs: out, watermark: watermark ?? listed.watermark, truncated };
}

export { WATCHED_WORKFLOWS };
