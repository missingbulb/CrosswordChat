// THE OPERATOR HOLD. One repository
// Actions variable stops the whole queue: every Claudinite workflow carries it
// into its env, and every engine entry point checks it as its FIRST act — before
// any read, like the dormancy gate beside it — and exits cleanly having fired
// nothing.
//
// Why a variable rather than a commit: cancelling one run means "move on", an
// intent the failure continuation and the leash already serve. Stopping the
// SYSTEM is a different intent, and the only lever that existed for it was
// dormancy, which needs a commit and an update to take effect and another to
// undo. A variable takes effect on the next run and clears the same way.
//
// What it freezes: STARTS. A run already past this gate finishes the drain it is
// in: killing live work would leave exactly the half-done state the leash exists to
// recover, and the value a run holds is the one it started with — `vars` reaches a
// job's env at start only, and the REST variables API that could re-read it is
// refused to the Actions GITHUB_TOKEN (403, and no `permissions:` key grants it).
// A hold set mid-drain lands on the next run.
//
// Resume needs no code: clear the variable and the next scheduler run reclaims, readies and
// drains on its own. The impatient path is dispatching the SCHEDULER workflow, not
// the bare executor — the scheduler run is what re-derives the world.

import { actionsEnv } from './actions.mjs';
import { varsBag } from './vars-bag.mjs';

export const SUSPEND_ALL_VAR = 'CLAUDINITE_TASKS_SUSPEND_ALL';

// Read from the vars bag where the job carries one (the executor), else from the
// named env copy: the scheduler workflow carries no bag, and stamps this one
// variable by name because it is the one variable the scheduler needs. A member
// executor that never received the bag still carries the named copy, and is served
// by the same fallback.
const suspendValue = (env) => varsBag(env)?.[SUSPEND_ALL_VAR] ?? env[SUSPEND_ALL_VAR];

// Deliberately narrow: a variable somebody set to `false` or `0` to mean "off"
// must not read as on. Anything else — unset, empty, a word — is not a hold.
export const isSuspended = (env = actionsEnv()) =>
  ['true', '1', 'yes'].includes(String(suspendValue(env) ?? '').trim().toLowerCase());

// Kept at its name for a member's local pack that imports it. It answers what the run
// started with: the REST variables API a live re-read would need is refused to the
// Actions token in every member, so a re-read could never answer differently.
export const liveSuspendReader = (_gh, _repo, { env = actionsEnv() } = {}) => async () => isSuspended(env);

// The one line every entry point prints when it parks, so a run that did nothing
// says WHY it did nothing — a silent clean exit is indistinguishable from a run
// that found no work.
export const suspendedNotice = () =>
  `- ${SUSPEND_ALL_VAR} is set: the queue is held. Nothing is picked up, created, readied or reclaimed.\n`
  + '  Clear the variable in repo settings (Settings → Secrets and variables → Actions → Variables) to resume;'
  + ' the next scheduled scheduler run recovers everything on its own.';
