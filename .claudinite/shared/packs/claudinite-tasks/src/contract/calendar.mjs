// The scheduling CALENDAR: the frequency vocabulary and the period arithmetic
// Pure and stateless. Given a frequency and a `now` it answers
// exactly one question, WHEN did that frequency's current period open.
//
// THE PERIOD IS THE UTC CALENDAR, and nothing a repo configures (#1995). A day opens
// at midnight UTC, a week on the Sunday that opened it, a month on its 1st. A
// configurable boundary buys no ordering the cron's wandering fire time can keep, and
// costs a seam: before the configured hour the current period is still yesterday's,
// so the same run reads as consumed at 03:00 and as open at 09:00.
//
// There is no occurrence IDENTITY here, and that is the point: under the
// work-item queue an occurrence is identified by the item's issue number, so the
// calendar owns the instants and nothing else.
//
// All times are UTC. This module never reads the clock itself, `now` is always
// injected, so every answer is deterministic and testable.

// The legal frequency tokens — the vocabulary the runtime contract validates
// against and the author-time declaration check rejects anything outside.
//
// `manual` is the one non-cadence: a manual task has no occurrence at all, so the
// scheduler run never instantiates it and it runs only from an item created by hand.
// It exists for operator levers - work that
// answers no recurring question but wants a task's whole apparatus (declaration,
// contract validation, code-work, the work item) when a human pulls it.
export const FREQUENCIES = ['daily', 'weekly', 'monthly', 'manual'];

const HOUR_MS = 3600 * 1000;
const DAY_MS = 24 * HOUR_MS;

// Sunday opens the week, matching Date#getUTCDay's own 0.
const SUNDAY = 0;

// When `frequency`'s current period opened, as a Date, or `null` for `manual`,
// which has no period at all. `now` may be a Date or anything the Date constructor
// accepts. A period that opens exactly at `now` is the current one.
export function anchorInstant(frequency, now) {
  const at = new Date(now);
  if (frequency === 'manual') return null;

  const midnight = Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate());
  if (frequency === 'daily') return new Date(midnight);
  // Back to the Sunday that opened this week. Today counts when today IS Sunday.
  if (frequency === 'weekly') return new Date(midnight - ((at.getUTCDay() - SUNDAY + 7) % 7) * DAY_MS);
  if (frequency === 'monthly') return new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), 1));

  throw new Error(`unknown frequency "${frequency}"`);
}

// --- the cadence terms ----------------------------------------------------------
// How a task states WHEN it runs, inside its own `preconditions`: the engine keeps
// no calendar of its own, so the cadence is one of the task's conditions, read off its own run history at every scheduler tick.
//
//   schedule:at-most-<daily|weekly|monthly>   no run created or closed since this
//                                             UTC period opened
//
// The name states what the term is and is not. It is a RATE LIMIT on the scheduler's
// own asking, never a content gate, so it says nothing about whether there is work to
// do: that is what the conditions beside it are for. And it is about the schedule, so
// it yields to a person: a hand-woken item satisfies it without the run history being
// read at all.
//
// Whether a task is asked at all is its `trigger`, not the shape of this list: a
// task nothing asks may still state conditions, which are judged when somebody
// creates an item for it (the retired `frequency: manual` is `trigger: 'request'`).
//
// The parse lives here, beside the frequency vocabulary it replaces, and imports
// nothing: the dashboard's browser bundle reads a cadence the way the scheduler does.
export const CADENCES = ['daily', 'weekly', 'monthly'];
// What separates the alternatives inside one entry. The policy engine parses the same
// grammar; this module re-spells it so it stays import-free.
export const ALTERNATIVE_SEPARATOR = '||';
export const SCHEDULE_TERM = 'schedule';
export const AT_MOST_PREFIX = 'at-most-';
export const NOT_FAILED_TERM = 'last-run-not-failed';
export const NOT_PARKED_TERM = 'last-run-not-parked';

// The term a cadence is stated as, and the cadence read back out of one. An argument
// outside the vocabulary reads back as null, which is what the author-time check reports.
export const scheduleTermFor = (cadence) => `${SCHEDULE_TERM}:${AT_MOST_PREFIX}${cadence}`;
export function cadenceOfScheduleArg(arg) {
  const text = String(arg ?? '');
  if (!text.startsWith(AT_MOST_PREFIX)) return null;
  const cadence = text.slice(AT_MOST_PREFIX.length);
  return CADENCES.includes(cadence) ? cadence : null;
}

// `due:<cadence>`, the same term under the name it was introduced with. PERMANENT, not
// a migration window: a task declaration is
// member-owned data that no vendoring pass rewrites, so a member can carry the old
// spelling indefinitely and must keep working. `task-declaration-shape` is what stops a
// NEW declaration naming it, and `normalizeCadenceTerms` is the door that makes every
// reader downstream of a loaded declaration see one spelling.
export const DUE_TERM = 'due';

// Rewrite every `due:<cadence>` in an expression to the current spelling, in place,
// leaving everything else byte-identical.
export function normalizeCadenceTerms(preconditions) {
  if (!Array.isArray(preconditions)) return preconditions;
  return preconditions.map((entry) => (typeof entry === 'string'
    ? entry.split(ALTERNATIVE_SEPARATOR)
      .map((alt) => {
        const t = alt.trim();
        const cadence = t.startsWith(`${DUE_TERM}:`) ? t.slice(DUE_TERM.length + 1) : null;
        return cadence !== null && CADENCES.includes(cadence) ? alt.replace(t, scheduleTermFor(cadence)) : alt;
      })
      .join(ALTERNATIVE_SEPARATOR)
    : entry));
}

// The term references an expression carries: each entry split on `||`, each
// reference `{ name, arg }` with the argument after the first colon. The policy
// engine's parse of the same grammar is the one that validates.
const alternativesOf = (entry) => String(entry ?? '').split(ALTERNATIVE_SEPARATOR).map((t) => t.trim()).filter(Boolean)
  .map((t) => { const c = t.indexOf(':'); return c === -1 ? { name: t, arg: null } : { name: t.slice(0, c).trim(), arg: t.slice(c + 1).trim() }; });
const entriesOf = (preconditions) => (Array.isArray(preconditions) ? preconditions : []).map(alternativesOf);

// The cadence a declaration states, as `{ kind: 'period', cadence }`, or null for a
// task with no cadence term (asked at every tick while it states any condition, it
// runs whenever those hold). The first cadence term wins. Both spellings are read
// here rather than only the current one, so a caller that did not come through the
// door, the dashboard lifting a declaration out of GitHub as text, gets the same answer.
export function cadenceOf(preconditions) {
  for (const ref of entriesOf(preconditions).flat()) {
    if (ref.name === SCHEDULE_TERM) {
      const cadence = cadenceOfScheduleArg(ref.arg);
      if (cadence) return { kind: 'period', cadence };
    }
    if (ref.name === DUE_TERM && CADENCES.includes(ref.arg)) return { kind: 'period', cadence: ref.arg };
  }
  return null;
}

// Whether the declaration states any condition at all. Not a scheduling answer on
// its own — `trigger` is that — but what the contract's door reads to derive one
// for a declaration written before the field existed (#1789). An entry carrying
// only separators states nothing, which is why this is not a length test.
export const statesConditions = (preconditions) => entriesOf(preconditions).some((alts) => alts.length > 0);

// A term gates when it is a whole conjunct of the expression — `['x', …]` gates,
// `['due:daily || x']` merely widens.
const gatesOn = (preconditions, term) =>
  entriesOf(preconditions).some((alts) => alts.length === 1 && alts[0].name === term && alts[0].arg === null);

// A task stops past its own failure park only when it says so: nothing holds a
// task's lane but its own word — `last-run-not-failed` for that park alone, or
// `last-run-not-parked`, which holds behind all four and so answers this too.
export const holdsOnFailure = (preconditions) =>
  gatesOn(preconditions, NOT_FAILED_TERM) || gatesOn(preconditions, NOT_PARKED_TERM);

// Whether the declaration holds its lane behind EVERY park, the three a person's
// inbox owns included. A reader showing what happens next needs the wider answer
// as well: a task held behind an approval park is not being asked on schedule,
// and an anchor shown there promises a run the task declines.
export const holdsOnAnyPark = (preconditions) => gatesOn(preconditions, NOT_PARKED_TERM);

// What the retired `frequency` field always meant, as the term that says it now, or
// null for `manual`, which meant no schedule at all and so adds no term.
export const cadenceTermFor = (frequency) =>
  (frequency === 'manual' ? null : scheduleTermFor(frequency));
