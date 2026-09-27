// Anchors — when a cadence's occurrence falls (docs/PRINCIPLES.md).
//
// The arithmetic lives in the calendar module; this one exposes exactly the two
// questions asked of it: "which period is current" (what a `schedule:at-most-`
// term measures a task's run history against) and "when does the next one open"
// (what the dashboard renders), plus the period a cadence repeats on, and the
// period a TASK keeps, read off its own cadence term.
//
// Pure and stateless: `now` is always injected, every value is UTC.

import { anchorInstant, cadenceOf } from '../contract/calendar.mjs';

const HOUR_MS = 3600e3;
const DAY_MS = 24 * HOUR_MS;

// One period of a cadence word (`daily`, `weekly`, `monthly`, `manual` having
// none), in ms - the unit the repair phase's stale-ready rule counts in
// (PRINCIPLES.md) and the coarse step `nextAnchor` walks. An unrecognised word
// reads as a day: this feeds the repair phase's stale-ready bound and the
// precondition's signal window, so anything shorter parks a member's task
// needs-human on every sweep (PRINCIPLES.md).
export function periodMs(frequency) {
  if (frequency === 'weekly') return 7 * DAY_MS;
  if (frequency === 'monthly') return 31 * DAY_MS;
  if (frequency === 'manual') return null;
  return DAY_MS;
}

// The period a TASK keeps, read off the cadence term its declaration states, and
// null for a task with no cadence term (asked at every tick, it runs on movement
// or when woken).
export function taskPeriodMs(decl) {
  const cadence = cadenceOf(decl?.preconditions);
  return cadence === null ? null : periodMs(cadence.cadence);
}

// When the current period opened, as a Date. `manual` has none, nothing schedules
// it, so null is the whole answer.
export const mostRecentAnchor = anchorInstant;

// When the next period opens, strictly after `now`, which is what a rolled item is
// stamped with. Derived by walking `mostRecentAnchor` forward rather than by adding
// a period, because months are not a fixed distance apart. The coarse step is under
// one period, so the loop advances by at most two steps and never overshoots.
export function nextAnchor(frequency, now) {
  if (frequency === 'manual') return null;
  const from = mostRecentAnchor(frequency, now).getTime();
  // An unreadable instant makes every comparison below false, so the walk would never
  // terminate. There is no next period of a moment that is not one.
  if (!Number.isFinite(from)) return null;
  const step = frequency === 'monthly' ? 28 * DAY_MS : periodMs(frequency);
  for (let t = from + step; ; t += step) {
    const candidate = mostRecentAnchor(frequency, new Date(t));
    if (candidate.getTime() > from) return candidate;
  }
}
