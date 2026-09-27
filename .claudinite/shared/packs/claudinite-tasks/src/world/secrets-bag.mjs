// The executor's per-task secret selection: a task's code-work gets exactly the names
// that task declared, selected here, rather than the executor's whole environment.
//
// NOTHING SETS THE BAG (#1336). Serialising the whole secrets context into one
// variable is the shape GitHub's malicious-workflow detection flags, parking every
// executor run until a person approves it, so the workflow names its secrets and the
// plain environment is the LIVE source. The bag READER is the tolerance: a member
// whose live executor still stamps one moves off it only through a human-merged PR of
// its own, and dropping the reader early would hand that member's code-work the whole
// blob, since the scrub goes with it. Its retirement is a fleet read rather than a
// canon release (#1914).

import { parseBag } from './env-bag.mjs';
import { actionsEnv } from './actions.mjs';

export const SECRETS_BAG_ENV = 'CLAUDINITE_SECRETS';

// The parsed bag, or null when this job carries none. A malformed bag is null too:
// the caller's own "declared but not configured" posture then names the secret, which
// is a better answer than a crash inside a JSON parse.
export const secretsBag = (env = actionsEnv()) => parseBag(env[SECRETS_BAG_ENV]);

// One secret's value, or undefined: the bag's where a legacy executor still stamps
// one, the plain environment otherwise.
export function secretValue(name, env = actionsEnv(), bag = secretsBag(env)) {
  // The bag holds every secret the repository has, so its own variable is not a
  // secret anyone may ask for by name — otherwise one declaration re-exports all of
  // them and the selection below means nothing.
  if (name === SECRETS_BAG_ENV) return undefined;
  const fromBag = bag?.[name];
  return fromBag === undefined ? env[name] : fromBag;
}

// The declared subset, as an environment fragment: only the names asked for, only the
// ones this job actually carries. A name with no value is left out rather than set to
// an empty string, so a consumer can still tell unset from set-but-empty.
export function secretsFor(names = [], env = actionsEnv()) {
  const bag = secretsBag(env);
  const out = {};
  for (const name of names) {
    const value = secretValue(name, env, bag);
    if (value !== undefined) out[name] = value;
  }
  return out;
}
