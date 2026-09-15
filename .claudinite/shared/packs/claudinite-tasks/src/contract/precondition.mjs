// THE PRECONDITION SEAM — the one call that turns a discovered task plus its
// collected signals into a verdict, and the window arithmetic a verdict is judged
// over. Contract rather than stage: both stages ask it (the scheduler run at the
// anchor, the executor again at pick), and what it means is fixed by the
// declaration, not by who is asking.

import { periodMs } from '../items/anchors.mjs';
import { taskCadence } from './task-contract.mjs';
import { evaluatePreconditions } from './precondition-policy.mjs';

export const DAY_MS = 86400e3;
export const SLACK_MS = 3600e3;

// The window a task reads with no run of its own to measure from: its cadence
// term's period, a day where it states none.
export function defaultWindowMs(task) {
  const cadence = taskCadence(task?.decl);
  if (cadence?.kind === 'due') return periodMs(cadence.cadence) + SLACK_MS;
  if (cadence?.kind === 'elapsed') return cadence.ms + SLACK_MS;
  return DAY_MS + SLACK_MS;
}

// The lookback in DAYS a verdict is judged over — what a term needs when its
// dimension carries an age rather than a windowed flag of its own (the
// conversation-logs branch reports how old its newest capture is, not whether one
// landed). Read off the collected bundle, which is where the window was decided.
export const windowDaysOf = (task, signals) => signals?.runs?.window?.days ?? defaultWindowMs(task) / DAY_MS;

// Run one task's precondition. THE only place a precondition is ever called, so a
// test that drives this drives what production drives — a precondition first
// written to take `{ signals }` passed its own direct-call test and threw on every
// real run, which is the failure this seam exists to make impossible.
//
// One form comes through here: the declarative `preconditions` expression, which
// is the only gate a task may declare (#1617). It fails LOUD by construction — a
// term that throws, an unknown name, an unreadable signal all return `{ error }`,
// a run failure the caller parks rather than a decline taken on a guess.
export function evaluatePrecondition(task, signals, packConfig = {}, item = null, at = null, schedule = null) {
  return evaluatePreconditions({
    preconditions: task.decl.preconditions,
    signals,
    config: packConfig,
    item,
    terms: task.terms,
    // The window the signals were collected over, read off the bundle where it
    // was decided (src/signals/for-task.mjs).
    windowDays: windowDaysOf(task, signals),
    // The repo's anchor settings, which a `due:` term resolves its cadence on.
    schedule,
    // The instant this verdict is for — the same one the signals were collected
    // for, so a clock-reading term and a windowed one cannot disagree about when
    // "now" is.
    now: at,
  });
}
