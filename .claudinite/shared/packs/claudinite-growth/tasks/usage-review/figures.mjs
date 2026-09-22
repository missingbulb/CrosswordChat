// What each figure name in a rule's `when`, `and` or `floor` MEANS - the one place
// the review's vocabulary meets the record's. The evaluator knows the grammar and
// nothing else; this knows the counters and nothing about rules.
//
// Every reader here returns `null` for *not recorded* and a number otherwise,
// including 0. The distinction is the whole point: a week frozen before a counter
// existed carries no key, and reading that as zero would report a skill nobody
// could measure as a skill nobody used.
//
// The record is read off the fold file's OWN `fields` header, never a vocabulary
// imported from the pack that writes it: the file is a published artifact, and a
// consumer that imported the writer's code would break the day the two shipped
// apart. Same reason the dashboard reads it that way.

// A day row's bare map, summed across the window for one key. `null` where no day
// in the window carried the map at all - which is the shape a counter has before
// the fold that writes it has run anywhere in the window.
function sumBare(days, map, key) {
  let total = null;
  for (const day of days) {
    const carried = day?.[map];
    if (!carried || typeof carried !== 'object') continue;
    total = (total ?? 0) + (carried[key] ?? 0);
  }
  return total;
}

// …and a counter group's field under one key.
function sumGroup(days, group, key, field) {
  let total = null;
  for (const day of days) {
    const row = day?.[group]?.[key];
    if (!row || typeof row !== 'object' || !(field in row)) continue;
    total = (total ?? 0) + (row[field] ?? 0);
  }
  return total;
}

// A scalar the day row carries in its own right.
function sumScalar(days, field) {
  let total = null;
  for (const day of days) {
    if (typeof day?.[field] !== 'number') continue;
    total = (total ?? 0) + day[field];
  }
  return total;
}

// Every key of a group, summed - the scope totals, for the rules that judge the
// checks as a whole rather than one rule of them.
function sumEveryKey(days, group, field) {
  let total = null;
  for (const day of days) {
    for (const row of Object.values(day?.[group] ?? {})) {
      if (!row || !(field in row)) continue;
      total = (total ?? 0) + (row[field] ?? 0);
    }
  }
  return total;
}

export function median(values) {
  const sorted = values.filter((v) => typeof v === 'number' && Number.isFinite(v)).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// What one Stop sweep cost, per day - the mean over that day's runs, which is what
// a median across the window is then taken of. A day whose sweeps left no timing
// record contributes nothing rather than a zero.
export function dailyStopMs(days) {
  const out = [];
  for (const day of days) {
    const row = day?.checkTiming?.work;
    if (!row || !(row.runs > 0) || typeof row.totalMs !== 'number') continue;
    out.push(row.totalMs / row.runs);
  }
  return out;
}

// HOW BUSY THE REPOSITORY WAS, as one number - the denominator every rule's
// "is there enough here to judge" floor is read against.
//
// No single counter answers it. A window can carry many prompts and no merges, or
// many merges and few prompts, and a floor reading either one alone calls the other
// kind of week quiet. So four counters answer it together, each approaching the
// same question from a different side: what the owner asked for, what the
// conversation cost, what shipped, and what closed.
//
// `per` is the unit that puts a term on the same scale as the others, so a typical
// window contributes comparably from each. The WEIGHTS are then the only bias in
// the blend, and they are deliberately uneven: a person's own prompts are the most
// direct evidence that work happened here, so they carry the most. Both halves are
// cheap to re-examine from the record, and the retrospective brief says so.
//
// `tokensOut` rather than `tokensIn`: input is dominated by cache reads (fifteen
// billion against forty-eight million in the window this was chosen from), so it
// measures the harness's caching far more than it measures the work.
export const ACTIVITY_TERMS = Object.freeze({
  userMessages: Object.freeze({ weight: 0.4, per: 1 }),
  tokensOut: Object.freeze({ weight: 0.2, per: 100_000 }),
  merges: Object.freeze({ weight: 0.2, per: 1 }),
  itemsClosed: Object.freeze({ weight: 0.2, per: 1 }),
});

// The blend, given a reader for one term's window total. A term the record does not
// carry is DROPPED and the remaining weights re-normalized over what was recorded -
// never counted as a zero, which would report a window nobody could measure as a
// window in which nothing happened. No term recorded at all is `null`, and a term
// that really is zero still counts as zero.
export function activityOf(readTerm) {
  let weighted = 0;
  let covered = 0;
  for (const [name, { weight, per }] of Object.entries(ACTIVITY_TERMS)) {
    const value = readTerm(name);
    if (value === null || value === undefined || !Number.isFinite(value)) continue;
    weighted += weight * (value / per);
    covered += weight;
  }
  return covered === 0 ? null : weighted / covered;
}

// name → (subject, window, live) → number | null.
//
// `window` is `{ days: [row] }` for whichever of the two windows the atom named;
// `live` is the tree as it stands. A rule naming a figure absent from this map
// never fires, silently - which is what the evaluator's own suite refuses.
export const FIGURES = new Map(Object.entries({
  // --- denominators every subject kind shares ---
  sessions: (subject, w) => sumScalar(w.days, 'sessions'),
  // The blend above, read off the window. Every rule whose floor asks "was the
  // repository busy enough to judge this" reads this one figure, whatever kind of
  // subject it judges; the THRESHOLD differs by kind, the measure does not.
  activity: (subject, w) => activityOf((name) => (name === 'itemsClosed'
    ? sumEveryKey(w.days, 'queue', 'done')
    : sumScalar(w.days, name))),

  // --- a skill against the record ---
  skillSessions: (s, w) => sumBare(w.days, 'skillSessions', s.id),
  skillLoads: (s, w) => sumBare(w.days, 'skillLoads', s.id),
  skillBlocks: (s, w) => sumBare(w.days, 'skillBlocks', s.id),
  moments: (s, w) => sumBare(w.days, 'moments', s.id),
  skillCaught: (s, w) => sumBare(w.days, 'skillCaught', s.id),
  triggerFired: (s, w) => sumGroup(w.days, 'triggerFires', s.id, 'fired'),
  triggerFollowed: (s, w) => sumGroup(w.days, 'triggerFires', s.id, 'followed'),
  // The calls of the tools this skill's own result triggers name - the denominator
  // "does the symptom follow most calls of that tool" is asked against. A skill
  // naming no tool has no such denominator, which is not a zero.
  toolCalls: (s, w) => (s.tools?.length
    ? s.tools.reduce((total, tool) => {
      const n = sumBare(w.days, 'toolCalls', tool);
      return n === null ? total : (total ?? 0) + n;
    }, null)
    : null),

  // --- a skill's own body ---
  // What a load costs the session. The declaration beside it says how the skill
  // expects to be REACHED, never how often, so there is no declared rate to read:
  // a rate an author states is a guess, and a finding computed against one
  // measures the guess rather than the skill.
  tokens: (s) => s.tokens ?? null,

  // --- a check ---
  // `runs` is how often the scopes ran at all: a rule runs whenever its scope does,
  // and there is no per-rule run counter to have instead.
  runs: (s, w) => sumEveryKey(w.days, 'checks', 'runs'),
  checkFindings: (s, w) => {
    const blocking = sumGroup(w.days, 'checkFindings', s.id, 'blocking');
    const advisory = sumGroup(w.days, 'checkFindings', s.id, 'advisory');
    // A rule the window recorded nothing about fired nothing - the check counters
    // cover every session in the window, so absence here IS zero, unlike a counter
    // that may simply not have existed yet.
    if (blocking === null && advisory === null) return w.carriesCheckFindings ? 0 : null;
    return (blocking ?? 0) + (advisory ?? 0);
  },
  checkSessions: (s, w) => sumGroup(w.days, 'checkFindings', s.id, 'sessions'),
  advisory: (s, w) => sumGroup(w.days, 'checkFindings', s.id, 'advisory'),
  advisoryPersisted: (s, w) => sumGroup(w.days, 'checkFindings', s.id, 'persisted'),
  relent: (s, w) => sumGroup(w.days, 'checkFindings', s.id, 'relent'),

  // --- a guard ---
  guardAdvisory: (s, w) => sumGroup(w.days, 'guardFires', s.id, 'advisory'),

  // --- the checks as a whole ---
  errors: (s, w) => sumEveryKey(w.days, 'checks', 'errors'),
  stopMs: (s, w) => {
    const daily = dailyStopMs(w.days);
    // Only ever read through `median()`, and a sum of per-run means would mean
    // nothing, so the bare form is the median too.
    return median(daily);
  },

  // --- the tree as it stands, which no window applies to ---
  acceptances: (s, w, live) => live.acceptancesOf(s.id),
}));

// The reader the evaluator is handed: it resolves an atom's window and hands the
// figure's own function the row set it asked for.
export function figureReader({ window, previous, live }) {
  return (subject, name, { previous: wantsPrevious = false, median: wantsMedian = false } = {}) => {
    const read = FIGURES.get(name);
    if (!read) return null;
    const w = wantsPrevious ? previous : window;
    if (!wantsMedian) return read(subject, w, live);
    // `median(x)` is the median of x across the window's days, and a figure whose
    // reader already medians (stopMs) answers for itself.
    if (name === 'stopMs') return read(subject, w, live);
    return median(w.days.map((day) => read(subject, { ...w, days: [day] }, live)));
  };
}
