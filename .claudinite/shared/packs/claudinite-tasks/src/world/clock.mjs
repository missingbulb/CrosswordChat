// THE CLOCK PORT. Reading "now" is an edge to the world exactly like a REST call
// is: it makes a run's answer depend on something outside its inputs. Every
// module under `src/` that needs the current instant asks here, so a simulator
// can drive a whole run at a chosen instant by replacing this one implementation
// and nothing else changes hands.
//
// Parsing a timestamp is NOT a clock read — `new Date(iso)` over a string a
// caller supplied is arithmetic, stays where it is used, and is deliberately
// outside what this port covers.

// The current instant, as a Date. The one place `new Date()` is called with no
// argument anywhere under `src/`.
export const now = () => new Date();

// The current instant in epoch milliseconds — for durations and unique suffixes,
// where a Date object would only be unwrapped again.
export const nowMs = () => Date.now();

// The current instant as the ISO-8601 string the queue's records are written in.
export const nowIso = () => new Date().toISOString();
