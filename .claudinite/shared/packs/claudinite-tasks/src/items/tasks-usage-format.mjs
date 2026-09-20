// The ON-DISK SHAPE of `.claudinite/local/tasks-usage.GENERATED.json` — what the
// machinery cost and how well it ran, as opposed to what the repo's SESSIONS did,
// which is `usage-format.mjs`'s file beside it.
//
// TWO FILES, NOT ONE, and the split is by SOURCE rather than by subject. The session
// fold's numbers come out of captured transcripts and a handful of listings; these
// come out of the run and jobs listings, the items' own label events, and the cost
// records the runs print. A fold outage on one must not be an outage on the other,
// and the two are read by different panels at different depths. What they share is
// their DISCIPLINE, deliberately: the same three tiers, the same watermarks, the
// same per-source fail-soft, and the same rule that an absent source leaves no key.
//
// THE SHAPE IS THE SAME SHAPE. Positional tuples against a `fields` header the file
// declares for itself, literal keys for the names that vary (workflows, tasks, run
// ids, item numbers), `null` for a slot a row predates. A consumer reads it the way
// it reads the session file — off the header, with no code from here.
//
// WHAT EACH TIER IS FOR. Hours are the live cost picture and expire in three days;
// days reach a month back and are what the cost panels read; weeks are frozen once
// and are what a window-over-window reading is taken from. One of the day tier's
// maps deliberately does NOT reach the week tier — see WEEK_GROUPS.
//
// EVERY TIER HERE IS APPEND-ONCE, which is the one place this file's discipline
// differs from the session file's. That file recomputes its day rows from capture
// files it re-reads for free; every source behind THIS one is a rate-limited
// listing read past a watermark, so nothing is recomputed and a counting bug fixed
// later applies from the fix forward. The price is stated rather than hidden, as it
// is for the session file's own appended rows.

import { PARK_KINDS } from '../../public/task-constants.mjs';
import { ALL_RUN_PHASES } from './run-record.mjs';

export const TASKS_USAGE_VERSION = 1;

// Where the file lives, spelled once. Under `.claudinite/local/` because that is the
// repo-owned area the vendoring refresh never touches, and `merge=ours` reaches it
// through the mount's own `.gitattributes`, whose `*GENERATED*` pattern the engine
// converges — so this file needs no attributes line of its own.
export const TASKS_USAGE_PATH = '.claudinite/local/tasks-usage.GENERATED.json';

// The queue's own outcome words, spelled here for the same reason the session file
// spells them: this pack and the engine land on separate cycles, so a NEW engine
// export would be undefined in the window a member holds the older one, and a pack
// that fails to load fails the whole mount's self-test. The drift guard is a test
// driving the real `outcomeOf` over every outcome label.
export const QUEUE_OUTCOMES = Object.freeze(['done', 'delivered', 'obsolete', 'none']);

// The four latencies a closed item's own label events answer, in minutes. SAMPLES,
// never quantiles, for the reason the session file's `prs` are durations: a week's
// p50 is not derivable from its days', so the file carries what a reader needs to
// take the quantile over whatever window it is drawing.
//
// A slot whose far end never happened is ABSENT rather than zero — an agentless
// item has no hand-off, and an item nobody picked has no pick. `tickToItem` is
// absent too whenever the scheduler run that filed the item is outside the window
// this fold read: the gap is unknown, not instant.
export const LATENCY_FIELDS = Object.freeze([
  'tickToItemMinutes', 'itemToPickMinutes', 'pickToHandOffMinutes', 'handOffToConvergeMinutes',
]);

// What one workflow cost in one bucket. `jobs` is the jobs the runs comprised —
// Actions bills per JOB, not per run, so a run's minutes are the sum over its jobs
// and the two counts are kept apart. `spend` is present only where the pack config
// carries `actionsMinuteRate`; a repo that never set one (a public repo bills
// nothing) carries no key, and a reader says *not recorded* rather than drawing a
// zero it was never told.
export const WORKFLOW_FIELDS = Object.freeze(['runs', 'jobs', 'minutesBilled', 'spend']);

// What one run cost, from the `claudinite-run-cost` record it printed. Keyed by run
// id, and the phase words come from the record's own vocabulary so the counter key
// cannot drift from the token the run actually prints.
export const RUN_FIELDS = Object.freeze(['apiCalls', ...ALL_RUN_PHASES]);

// A bucket's own scalars: every workflow's costs summed, plus the run-level figures
// summed over the bucket's runs. They are what survives into the week tier, where
// the per-run map does not.
export const BUCKET_FIELDS = Object.freeze([...WORKFLOW_FIELDS, ...RUN_FIELDS]);

export const TASKS_USAGE_FIELDS = Object.freeze({
  hour: BUCKET_FIELDS,
  day: BUCKET_FIELDS,
  // `days` is how many day rows the week absorbed, so a fold outage longer than a
  // source's own reach declares its own hole rather than under-reporting silently.
  week: Object.freeze(['days', ...BUCKET_FIELDS]),
  // Keyed by the workflow word — `scheduler`, `executor`.
  workflows: WORKFLOW_FIELDS,
  // Keyed by the Actions run id. Named for what it holds rather than for its keys,
  // because `runs` is already a bucket SCALAR — how many runs the bucket saw — and
  // one object carries both.
  runCosts: RUN_FIELDS,
  // Keyed by `pack/task`.
  queue: QUEUE_OUTCOMES,
  parks: PARK_KINDS,
  // Keyed by the work item's issue number.
  latency: LATENCY_FIELDS,
});

// The sub-maps carrying a counter tuple per key. All of them here — this file has
// no bare-number maps, unlike the session file's skill loads.
export const COUNTER_GROUPS = Object.freeze(['workflows', 'runCosts', 'queue', 'parks', 'latency']);

// The sub-maps an HOUR row carries. An hour is the live cost picture — what ran and
// what it spent — and the queue's own outcomes are a question nobody asks by the
// hour, so the three item-derived maps stay in the day tier where they belong.
export const HOUR_GROUPS = Object.freeze(['workflows', 'runCosts']);

// The sub-maps a WEEK row carries, which is not all of them. A week's keys are
// frozen forever, so a map whose keys are unique per occurrence grows the file by a
// row's worth every week and can never be pruned:
//
//   - `runCosts` is dropped, and its numbers survive as the week's own scalars. Per-run
//     detail answers "what did this tick cost", a question about the last few days;
//     nobody asks it of a week last February.
//   - `latency` is KEPT, unique keys and all, because the samples ARE the week-level
//     answer: a quantile over a window needs the window's samples, and there is no
//     scalar that stands in for them.
export const WEEK_GROUPS = Object.freeze(['workflows', 'queue', 'parks', 'latency']);

const sortKeys = (obj) => Object.fromEntries(Object.keys(obj ?? {}).sort().map((k) => [k, obj[k]]));
const nonEmpty = (obj) => obj !== undefined && obj !== null && Object.keys(obj).length > 0;

export const tasksUsageFieldsHeader = () =>
  Object.fromEntries(Object.entries(TASKS_USAGE_FIELDS).map(([k, v]) => [k, [...v]]));

// One counter row, object → tuple. An absent key becomes `null` (unknown), never 0.
export function encodeCounters(row, fields) {
  return fields.map((f) => (row?.[f] === undefined || row?.[f] === null ? null : row[f]));
}

// …and back. A `null` slot, or one past the end of a short tuple, yields NO key.
export function decodeCounters(tuple, fields) {
  const row = {};
  fields.forEach((f, i) => {
    const n = Array.isArray(tuple) ? tuple[i] : undefined;
    if (typeof n === 'number') row[f] = n;
  });
  return row;
}

// A whole row, internal (named counters) → on-disk (tuples). An EMPTY sub-map is
// omitted rather than written as `{}`: zeros are implicit in this file by
// construction, so an empty map carries nothing a reader cannot derive.
export function encodeRow(row, totalsFields, groups = COUNTER_GROUPS) {
  const out = { totals: encodeCounters(row, totalsFields) };
  for (const group of groups) {
    if (!nonEmpty(row[group])) continue;
    const fields = TASKS_USAGE_FIELDS[group];
    out[group] = Object.fromEntries(
      Object.keys(row[group]).sort().map((k) => [k, encodeCounters(row[group][k], fields)]),
    );
  }
  return out;
}

// On-disk → internal, against the FILE's own declared vocabulary; `fields` is its
// `fields` header. Every group comes back present, empty where the row omitted it,
// because every consumer folds them key-wise.
export function decodeRow(row, totalsFields, fields = {}, groups = COUNTER_GROUPS) {
  const out = { ...decodeCounters(row?.totals, totalsFields) };
  for (const group of groups) {
    const vocab = fields[group] ?? TASKS_USAGE_FIELDS[group];
    out[group] = Object.fromEntries(
      Object.entries(row?.[group] ?? {}).map(([k, tuple]) => [k, decodeCounters(tuple, vocab)]),
    );
  }
  return out;
}

// The row vocabularies a parsed file declares, defaulted per key.
export function fieldsOf(file) {
  const declared = file?.fields ?? {};
  return Object.fromEntries(
    Object.keys(TASKS_USAGE_FIELDS).map((k) => [k, Array.isArray(declared[k]) ? declared[k] : TASKS_USAGE_FIELDS[k]]),
  );
}

// --- the file as a whole ---------------------------------------------------------

// The key an hour row is filed under: the UTC hour, `YYYY-MM-DDTHH`.
export const hourKey = (iso) => String(iso ?? '').slice(0, 13);

export function encodeTasksUsageFile({
  generated = null, foldedThrough = null, runsFoldedThrough = null, queueFoldedThrough = null,
  minuteRate = null, hours = {}, days = {}, weeks = {},
} = {}) {
  return {
    version: TASKS_USAGE_VERSION,
    // When the numbers were last CONFIRMED, which is not when the file last landed.
    generated,
    foldedThrough,
    runsFoldedThrough,
    queueFoldedThrough,
    // The rate every `spend` in this file was computed at, or null where the repo
    // declares none and no row carries a spend at all. Written beside the numbers
    // for the reason the session file writes its caps there: a figure computed under
    // a parameter means nothing without it, and a rate that changed later must not
    // silently re-price the rows frozen under the old one.
    minuteRate,
    fields: tasksUsageFieldsHeader(),
    hours: Object.fromEntries(
      Object.entries(hours).map(([k, v]) => [k, encodeRow(v, TASKS_USAGE_FIELDS.hour, HOUR_GROUPS)]),
    ),
    days: Object.fromEntries(Object.entries(days).map(([k, v]) => [k, encodeRow(v, TASKS_USAGE_FIELDS.day)])),
    weeks: Object.fromEntries(
      Object.entries(weeks).map(([k, v]) => [k, encodeRow(v, TASKS_USAGE_FIELDS.week, WEEK_GROUPS)]),
    ),
  };
}

// The file's text: ONE LINE PER ROW, for the reason the session file is written that
// way — the row is the unit anyone reads and the unit the fold rewrites, so it is
// the unit a line holds.
export function renderTasksUsageFile(file) {
  const rows = (obj) => Object.entries(obj ?? {})
    .map(([k, v]) => `    ${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(',\n');
  const block = (name, obj, end) => (Object.keys(obj ?? {}).length === 0
    ? [`  ${JSON.stringify(name)}: {}${end}`]
    : [`  ${JSON.stringify(name)}: {`, rows(obj), `  }${end}`]);
  return [
    '{',
    `  "version": ${JSON.stringify(file.version)},`,
    `  "generated": ${JSON.stringify(file.generated ?? null)},`,
    `  "foldedThrough": ${JSON.stringify(file.foldedThrough ?? null)},`,
    `  "runsFoldedThrough": ${JSON.stringify(file.runsFoldedThrough ?? null)},`,
    `  "queueFoldedThrough": ${JSON.stringify(file.queueFoldedThrough ?? null)},`,
    `  "minuteRate": ${JSON.stringify(file.minuteRate ?? null)},`,
    ...block('fields', file.fields, ','),
    ...block('hours', file.hours, ','),
    ...block('days', file.days, ','),
    ...block('weeks', file.weeks, ''),
    '}',
    '',
  ].join('\n');
}

// The one line the unchanged-compare ignores: the stamp moves every run by
// construction, and comparing the text as it stands would open a pull request a day
// on a repo where nothing ran.
export const withoutStamp = (text) => String(text ?? '')
  .split('\n').filter((l) => !/^\s*"generated":/.test(l)).join('\n');

export function decodeTasksUsageFile(file) {
  const empty = {
    generated: null, foldedThrough: null, runsFoldedThrough: null, queueFoldedThrough: null,
    minuteRate: null, hours: {}, days: {}, weeks: {},
  };
  if (!file || typeof file !== 'object') return empty;
  const fields = fieldsOf(file);
  const rows = (map, totals, groups) => Object.fromEntries(
    Object.entries(map ?? {}).map(([k, v]) => [k, decodeRow(v, totals, fields, groups)]),
  );
  return {
    generated: file.generated ?? null,
    foldedThrough: file.foldedThrough ?? null,
    runsFoldedThrough: file.runsFoldedThrough ?? null,
    queueFoldedThrough: file.queueFoldedThrough ?? null,
    minuteRate: typeof file.minuteRate === 'number' ? file.minuteRate : null,
    hours: rows(file.hours, fields.hour, HOUR_GROUPS),
    days: rows(file.days, fields.day, COUNTER_GROUPS),
    weeks: rows(file.weeks, fields.week, WEEK_GROUPS),
  };
}

export { sortKeys };
