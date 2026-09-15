// The production-verification spec as a FORMAT, published for the packs that write
// one. A verification item's body is composed by one pack's skill and read by this
// pack's probe worker, so the two could drift with nothing red: the writer's own
// tests assert the body it tells an agent to write against the parser that will
// actually read it, and that needs an address other packs may import.
//
// Three names, not the worker: what a spec looks like, and the re-arm cadence a
// not-yet-live run reschedules itself on.
export { parseVerificationSpec, parseRetryEvery, RETRY_FIELD } from '../tasks/verify-production/probes.mjs';
