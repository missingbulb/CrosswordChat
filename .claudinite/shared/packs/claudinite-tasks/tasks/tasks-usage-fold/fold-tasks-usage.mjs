// The counting and folding core of the tasks-usage fold. Pure: it takes what the
// readers found, the prior file and today's UTC date, and returns the next file's
// named-counter shape. Nothing here reads a clock, a network or a disk.
//
// APPEND-ONCE, EVERY TIER. Each source is a rate-limited listing read past its own
// watermark, so a run or an item is folded on the one pass that first sees it and
// never again — there is no local source to recompute from, unlike the session fold's
// capture files. Both watermarks are monotone over settled facts (a completed run's
// start does not move; a closed item's outcome is written at convergence), which is
// the whole exactly-once mechanism.
//
// UNKNOWN IS NOT ZERO, throughout. A run whose jobs listing could not be read
// contributes to `runs` and leaves `jobs` and `minutesBilled` alone; a repo with no
// `actionsMinuteRate` carries no `spend` anywhere; a latency whose far end never
// happened has no key. An accumulator starts a field at the first bucket that
// actually carries it rather than seeding every bucket with a zero.

import {
  TASKS_USAGE_FIELDS, BUCKET_FIELDS, WORKFLOW_FIELDS, RUN_FIELDS, LATENCY_FIELDS,
  QUEUE_OUTCOMES, COUNTER_GROUPS, WEEK_GROUPS, HOUR_GROUPS, hourKey, sortKeys,
} from '../../src/items/tasks-usage-format.mjs';
import { PARK_KINDS } from '../../public/task-constants.mjs';

// How long an hour row lives — three days, the session fold's own window, so the
// two files' live tiers reach the same distance back.
export const HOUR_WINDOW_HOURS = 72;

// How long a day row lives. A month, again matching the session file, because the
// cost panels read a month of days and the week rows keep what falls out.
export const DAY_WINDOW_DAYS = 30;

export const withinHourWindow = (key, nowIso, hours = HOUR_WINDOW_HOURS) => {
  const age = (new Date(`${String(nowIso).slice(0, 13)}:00:00Z`) - new Date(`${key}:00:00Z`)) / 3600000;
  return Number.isFinite(age) && age >= 0 && age < hours;
};

export const withinDayWindow = (date, today, days = DAY_WINDOW_DAYS) => {
  const age = (new Date(`${today}T00:00:00Z`) - new Date(`${date}T00:00:00Z`)) / 86400000;
  return Number.isFinite(age) && age >= 0 && age < days;
};

// An empty bucket: every counter group present and no scalar at all, so a field
// starts from the first thing that has an opinion about it.
const emptyBucket = (groups) => Object.fromEntries(groups.map((g) => [g, {}]));

// Add `n` into `row[field]`, starting the field at the first contribution rather
// than at zero. `null`/`undefined` adds nothing — that is the whole unknown-is-not-
// zero rule in one function.
function add(row, field, n) {
  if (!Number.isFinite(n)) return;
  row[field] = (row[field] ?? 0) + n;
}

// Merge one counter row into another, field-wise, under the same rule.
function addRow(into, from, fields) {
  for (const f of fields) add(into, f, from?.[f]);
}

// --- what the runs cost ----------------------------------------------------------

// One run's contribution to a bucket: its workflow's row, the bucket's own scalars,
// and — in the tiers that carry it — the per-run entry keyed by the run id.
//
// A run is counted under the day and hour its START falls in, never its end: a run
// that crossed midnight was a run of the day it began, which is also the day the
// listing's own watermark orders it by.
export function addRunToBucket(bucket, run, { minuteRate = null, withRunCosts = true } = {}) {
  const workflow = (bucket.workflows[run.workflow] ??= {});
  const spend = minuteRate !== null && Number.isFinite(run.minutesBilled)
    ? run.minutesBilled * minuteRate
    : null;

  for (const [field, n] of [['runs', 1], ['jobs', run.jobs], ['minutesBilled', run.minutesBilled], ['spend', spend]]) {
    add(workflow, field, n);
    add(bucket, field, n);
  }

  if (!run.cost) return bucket;
  // The cost record's own figures: into the bucket's scalars always, and into the
  // per-run map where the tier keeps one.
  add(bucket, 'apiCalls', run.cost.apiCalls);
  for (const [phase, ms] of Object.entries(run.cost.phaseMs ?? {})) add(bucket, phase, ms);
  if (withRunCosts) {
    const entry = (bucket.runCosts[String(run.id)] ??= {});
    add(entry, 'apiCalls', run.cost.apiCalls);
    for (const [phase, ms] of Object.entries(run.cost.phaseMs ?? {})) add(entry, phase, ms);
  }
  return bucket;
}

// The executor's cost records arrive with the ITEMS rather than with the runs, and
// one run leaves a snapshot on every item it settled. So they are collected per run
// id and reduced by MAXIMUM: the counters only ever grow within a run, so the
// largest snapshot is the run's total as of its last item. Taking the sum would
// count one run's whole spend once per item it touched.
export function costsByRun(items) {
  const out = new Map();
  for (const item of items ?? []) {
    for (const cost of item.costs ?? []) {
      const prior = out.get(cost.runId);
      if (!prior) { out.set(cost.runId, cost); continue; }
      out.set(cost.runId, {
        ...cost,
        apiCalls: Math.max(prior.apiCalls ?? -Infinity, cost.apiCalls ?? -Infinity),
        phaseMs: Object.fromEntries(
          [...new Set([...Object.keys(prior.phaseMs ?? {}), ...Object.keys(cost.phaseMs ?? {})])]
            .map((p) => [p, Math.max(prior.phaseMs?.[p] ?? 0, cost.phaseMs?.[p] ?? 0)]),
        ),
      });
    }
  }
  // A max over an empty set is `-Infinity`, which is not a count: fold it back to
  // "no opinion" so the encoder writes `null`.
  for (const [id, cost] of out) {
    if (!Number.isFinite(cost.apiCalls)) out.set(id, { ...cost, apiCalls: null });
  }
  return out;
}

// The runs a fold saw, with each executor run's cost record attached from the items
// it settled. A run the item side knows about but the run listing does not is NOT
// invented here: the listing is what says a run happened, and a stray record on an
// item whose run fell outside the window is one this fold simply has no bucket for.
export function withItemCosts(runs, items) {
  const byRun = costsByRun(items);
  return (runs ?? []).map((run) => (run.cost ? run : { ...run, cost: byRun.get(String(run.id)) ?? null }));
}

// --- what the items came to -------------------------------------------------------

export function addItemToDay(day, item) {
  const key = `${item.pack}/${item.task}`;
  const outcome = QUEUE_OUTCOMES.includes(item.outcome) ? item.outcome : 'none';
  add((day.queue[key] ??= {}), outcome, 1);
  // `parks: null` is a timeline that could not be read — unknown, so nothing is
  // written; an empty array is a real answer and writes nothing either, because a
  // task that needed no human has no park to count.
  for (const kind of item.parks ?? []) {
    if (PARK_KINDS.includes(kind)) add((day.parks[key] ??= {}), kind, 1);
  }
  if (item.latency && Object.keys(item.latency).length) {
    day.latency[String(item.number)] = { ...item.latency };
  }
  return day;
}

// --- the tiers ---------------------------------------------------------------------

export function foldHours({ prior = {}, runs = [], now, minuteRate = null }) {
  const hours = {};
  for (const [key, row] of Object.entries(prior)) {
    if (!withinHourWindow(key, now)) continue;
    hours[key] = { ...emptyBucket(HOUR_GROUPS), ...structuredClone(row) };
  }
  for (const run of runs) {
    const key = hourKey(run.startedAt);
    if (!withinHourWindow(key, now)) continue;
    addRunToBucket((hours[key] ??= emptyBucket(HOUR_GROUPS)), run, { minuteRate, withRunCosts: true });
  }
  return hours;
}

export function foldDays({ prior = {}, runs = [], items = [], today, minuteRate = null }) {
  const days = {};
  for (const [date, row] of Object.entries(prior)) {
    if (!withinDayWindow(date, today)) continue;
    days[date] = { ...emptyBucket(COUNTER_GROUPS), ...structuredClone(row) };
  }
  for (const run of runs) {
    const date = String(run.startedAt ?? '').slice(0, 10);
    if (!date || !withinDayWindow(date, today)) continue;
    addRunToBucket((days[date] ??= emptyBucket(COUNTER_GROUPS)), run, { minuteRate, withRunCosts: true });
  }
  for (const item of items) {
    if (!item.date || !withinDayWindow(item.date, today)) continue;
    addItemToDay((days[item.date] ??= emptyBucket(COUNTER_GROUPS)), item);
  }
  return days;
}

// The ISO-8601 week a UTC date falls in, `YYYY-Www` — computed rather than
// approximated, because an off-by-one would mis-file a whole week's row.
export function isoWeek(date) {
  const d = new Date(`${date}T00:00:00Z`);
  const day = (d.getUTCDay() + 6) % 7;                 // Mon=0 … Sun=6
  d.setUTCDate(d.getUTCDate() - day + 3);              // the week's Thursday
  const year = d.getUTCFullYear();
  const firstThursday = new Date(Date.UTC(year, 0, 4));
  const offset = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - offset + 3);
  const week = 1 + Math.round((d - firstThursday) / (7 * 86400000));
  return `${year}-W${String(week).padStart(2, '0')}`;
}

// The days to fold into weeks this run: every day that closed strictly after the
// watermark and strictly before today, in order. Days close strictly in order, so a
// single monotone mark is the whole exactly-once mechanism.
export function daysToFold(days, foldedThrough, today) {
  return Object.keys(days)
    .filter((d) => d < today && (!foldedThrough || d > foldedThrough))
    .sort();
}

// Add one day row into its week row, append-once. `days` counts the rows absorbed,
// so a fold outage longer than a source's reach declares its own hole rather than
// under-reporting silently.
export function addDayToWeek(week, day) {
  const w = week ?? emptyBucket(WEEK_GROUPS);
  for (const group of WEEK_GROUPS) w[group] ??= {};
  add(w, 'days', 1);
  addRow(w, day, BUCKET_FIELDS);
  for (const group of WEEK_GROUPS) {
    for (const [key, row] of Object.entries(day[group] ?? {})) {
      // The latency map is SAMPLES keyed by item, not counters: a week absorbs each
      // sample as it stands rather than summing two days' readings of one item.
      if (group === 'latency') { w.latency[key] = { ...row }; continue; }
      const into = (w[group][key] ??= {});
      addRow(into, row, TASKS_USAGE_FIELDS[group]);
    }
  }
  return w;
}

// --- the whole file ----------------------------------------------------------------

export function foldTasksUsage({
  prior = {}, today, now = null, generated = null, minuteRate = null,
  runs = [], runsFoldedThrough = null, items = [], queueFoldedThrough = null,
}) {
  const withCosts = withItemCosts(runs, items);
  const days = foldDays({ prior: prior.days ?? {}, runs: withCosts, items, today, minuteRate });
  const weeks = structuredClone(prior.weeks ?? {});
  let foldedThrough = prior.foldedThrough ?? null;

  for (const date of daysToFold(days, foldedThrough, today)) {
    const key = isoWeek(date);
    weeks[key] = addDayToWeek(weeks[key], days[date]);
    foldedThrough = date;
  }

  return {
    generated,
    foldedThrough,
    runsFoldedThrough: runsFoldedThrough ?? prior.runsFoldedThrough ?? null,
    queueFoldedThrough: queueFoldedThrough ?? prior.queueFoldedThrough ?? null,
    // The rate every `spend` in this file was computed at. Carried forward from the
    // prior file when this repo declares none, so a file that once priced its rows
    // still says what they were priced at.
    minuteRate: minuteRate ?? prior.minuteRate ?? null,
    hours: sortKeys(foldHours({
      prior: prior.hours ?? {}, runs: withCosts, now: now ?? `${today}T23:59:59Z`, minuteRate,
    })),
    days: sortKeys(days),
    weeks: sortKeys(weeks),
  };
}

export { WORKFLOW_FIELDS, RUN_FIELDS, LATENCY_FIELDS };
