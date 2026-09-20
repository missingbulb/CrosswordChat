// The tasks fold's SECOND source: what each occurrence came to, how long each step
// of it took, and what the executor run behind it spent.
//
// ONE READ PER ITEM, and that is the whole reason this module exists rather than
// calling the session fold's queue reader. That reader answers outcomes and parks
// off an item's EVENTS listing, which is exactly the right read for what it wants.
// This fold wants three things off one item — the parks, the four latencies between
// its label events, and the `claudinite-run-cost` record its executor left in a
// comment — and the TIMELINE endpoint carries labelings, comments and the close in
// one paged listing. Two listings per item to answer one item is the cost worth
// avoiding, so the timeline is read and the events reader is left where it is.
//
// APPEND-ONCE past the caller's watermark, for the reason the session fold's queue
// read is: a CLOSED item is settled — its outcome label is written at convergence
// and nothing later moves it — so an item is counted on the one fold that first sees
// it closed and never again. The boundary is `closed_at` and not `updated_at`, for
// the same reason again: the listing is asked for everything TOUCHED since the mark.
//
// FAIL-SOFT per item: a timeline that cannot be read costs that item its parks, its
// latencies and its cost record, and keeps its outcome row.

import { isQueueItem } from '../../src/items/read.mjs';
import { taskOf, parkKindOf } from '../usage-fold/read-queue.mjs';
import { STATUS_RUNNING_EXECUTOR, STATUS_RUNNING_AGENT } from '../../public/task-constants.mjs';
import { outcomeOf, spellingsOf } from '../../public/work-item-grammar.mjs';
import { parseRunCosts } from '../../src/items/run-record.mjs';

// How far back the FIRST read looks with no mark yet — the day tier's own width, as
// the session fold's queue read does, so one fold populates the whole window.
export const FIRST_READ_LOOKBACK_DAYS = 30;

export const lookbackFrom = (nowIso, days = FIRST_READ_LOOKBACK_DAYS) =>
  new Date(new Date(nowIso).getTime() - days * 86400000).toISOString();

// Every spelling of the two mid-flight statuses, so an item that ran under an older
// engine still reports its latencies rather than reading as never picked up.
const PICKED = new Set(spellingsOf(STATUS_RUNNING_EXECUTOR));
const HANDED_OFF = new Set(spellingsOf(STATUS_RUNNING_AGENT));

const minutesBetween = (from, to) => {
  const a = Date.parse(from ?? '');
  const b = Date.parse(to ?? '');
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return null;
  return Math.round((b - a) / 60000);
};

// The first instant a label from `names` was applied, out of a timeline listing.
// FIRST, not last: an item re-queued by hand is picked twice, and the latency being
// measured is the queue's own — how long the item waited for an executor after it
// was filed.
export function firstLabeledAt(timeline, names) {
  for (const e of timeline ?? []) {
    if (e?.event !== 'labeled') continue;
    if (names.has(String(e?.label?.name ?? ''))) return e.created_at ?? null;
  }
  return null;
}

// The park kinds one item collected, DEDUPED: an item that bounced between a person
// and the machine twice was parked for that kind once, as far as "how often did this
// task need a human" is concerned.
export function parksIn(timeline) {
  const kinds = new Set();
  for (const e of timeline ?? []) {
    if (e?.event !== 'labeled') continue;
    const kind = parkKindOf(e?.label?.name);
    if (kind) kinds.add(kind);
  }
  return [...kinds];
}

// The cost records an item's comments carry. An item is normally settled by ONE
// executor run, but a re-queued one is settled by another, so every record found is
// returned and the fold keys them by run id.
export function costsIn(timeline) {
  const out = [];
  for (const e of timeline ?? []) {
    if (e?.event !== 'commented') continue;
    out.push(...parseRunCosts(e?.body));
  }
  return out;
}

// The four latencies, in minutes. `tickToItem` needs the scheduler run that filed
// the item, which is not on the item at all: it is the newest scheduler run that had
// STARTED when the item was created, out of the runs this fold read. Where that run
// is outside the window, the slot is ABSENT — the gap is unknown, not instant.
//
// Every other slot is absent where its far end never happened: an agentless item has
// no hand-off, an item nobody picked has no pick. A zero there would read as an
// instant that was in fact a thing that did not occur.
export function latencyOf({ item, timeline, schedulerRuns = [] }) {
  const createdAt = item?.created_at ?? null;
  const pickedAt = firstLabeledAt(timeline, PICKED);
  const handedOffAt = firstLabeledAt(timeline, HANDED_OFF);
  const closedAt = item?.closed_at ?? null;

  let tickAt = null;
  for (const run of schedulerRuns) {
    if (!run?.startedAt || !createdAt || run.startedAt > createdAt) continue;
    if (tickAt === null || run.startedAt > tickAt) tickAt = run.startedAt;
  }

  const row = {
    tickToItemMinutes: minutesBetween(tickAt, createdAt),
    itemToPickMinutes: minutesBetween(createdAt, pickedAt),
    pickToHandOffMinutes: minutesBetween(pickedAt, handedOffAt),
    handOffToConvergeMinutes: minutesBetween(handedOffAt, closedAt),
  };
  // An absent slot leaves no key, so the encoder writes `null` for it rather than a
  // measured zero.
  return Object.fromEntries(Object.entries(row).filter(([, v]) => v !== null));
}

// One closed item → a record, or null when it is not this fold's business.
export function recordFor(issue, since) {
  if (!isQueueItem(issue)) return null;
  const closedAt = issue?.closed_at ?? null;
  if (!closedAt) return null;
  if (since && closedAt <= since) return null;
  const task = taskOf(issue);
  if (!task) return null;
  return {
    date: closedAt.slice(0, 10), closedAt, ...task,
    outcome: outcomeOf(issue) ?? 'none',
    number: issue?.number ?? null,
    created_at: issue?.created_at ?? null,
    // Filled by the caller from the item's own timeline, and left `null` — never
    // `[]` or `{}` — where that listing could not be read.
    parks: null, latency: null, costs: null,
  };
}

export async function readTimeline({ reader, repo, number, maxPages = 2 }) {
  const out = [];
  for (let page = 1; page <= maxPages; page += 1) {
    const batch = await reader.json(`/repos/${repo}/issues/${number}/timeline?per_page=100&page=${page}`);
    if (!Array.isArray(batch) || batch.length === 0) return page === 1 ? null : out;
    out.push(...batch);
    if (batch.length < 100) break;
  }
  return out;
}

// The whole read: `{ records, watermark, error? }`.
export async function readClosedItems({
  reader, repo, since, now, schedulerRuns = [], maxPages = 5,
}) {
  const from = since || lookbackFrom(now);
  const records = [];
  try {
    for (let page = 1; page <= maxPages; page += 1) {
      const path = `/repos/${repo}/issues?state=closed&sort=updated&direction=desc`
        + `&since=${encodeURIComponent(from)}&per_page=100&page=${page}`;
      const batch = await reader.json(path);
      if (!Array.isArray(batch) || batch.length === 0) break;
      for (const issue of batch) {
        if (issue?.pull_request) continue;          // the issues endpoint answers with both
        const rec = recordFor(issue, since);
        if (rec) records.push({ rec, issue });
      }
      if (batch.length < 100) break;
    }
  } catch {
    return { records: [], watermark: since, error: 'the closed work items could not be listed' };
  }

  // One timeline read per item, and only for the items this fold is seeing close for
  // the first time — the watermark above is what bounds the cost.
  for (const { rec, issue } of records) {
    if (rec.number === null) continue;
    let timeline = null;
    try { timeline = await readTimeline({ reader, repo, number: rec.number }); } catch { timeline = null; }
    if (timeline === null) continue;
    rec.parks = parksIn(timeline);
    rec.latency = latencyOf({ item: issue, timeline, schedulerRuns });
    rec.costs = costsIn(timeline);
  }

  const out = records.map((r) => r.rec);
  const newest = out.map((r) => r.closedAt).sort().pop() ?? null;
  return { records: out, watermark: newest ?? since ?? null };
}
