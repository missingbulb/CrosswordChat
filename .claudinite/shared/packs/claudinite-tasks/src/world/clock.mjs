// THE CLOCK PORT. Reading "now" is an edge to the world exactly like a REST call
// is: it makes a run's answer depend on something outside its inputs. Every
// module under `src/` that needs the current instant asks here, so a simulator
// can drive a whole run at a chosen instant by replacing this one implementation
// and nothing else changes hands.
//
// Parsing a timestamp is NOT a clock read — `new Date(iso)` over a string a
// caller supplied is arithmetic, stays where it is used, and is deliberately
// outside what this port covers.

// What "now" currently reads from. The wall clock in production, and whatever a
// simulator installed while it is driving a run.
let readMs = () => Date.now();

// The current instant, as a Date. The one place `new Date()` is called with no
// argument anywhere under `src/`.
export const now = () => new Date(readMs());

// The current instant in epoch milliseconds — for durations and unique suffixes,
// where a Date object would only be unwrapped again.
export const nowMs = () => readMs();

// The current instant as the ISO-8601 string the queue's records are written in.
export const nowIso = () => new Date(readMs()).toISOString();

// Replace the reading, and return the undo. This is the "replacing this one
// implementation" the header promises: a harness running the engine against a
// virtual clock installs its own instant here, and every `src/` module that asks
// for the time — the claim comment's stamp, a `Woken:` field, a minted branch's
// date — answers in that world rather than in this year.
//
// Deliberately a whole-process switch rather than a threaded argument: the point
// of a port is that a caller says what it needs and not where it comes from, and
// threading an instant through every module that reads one would put the clock
// back into every signature this module exists to keep it out of. Production
// never calls it; the undo is what keeps one harness's instant out of the next.
export function installClock(read) {
  const previous = readMs;
  readMs = read;
  return () => { readMs = previous; };
}
