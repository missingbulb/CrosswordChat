// Is a default-branch commit GENUINE PROJECT WORK, or the machinery moving? The one
// test, published because two very different readers ask it: the signal collectors,
// which gate a precondition on whether the repo moved in a window, and a cross-repo
// reader (the dashboard) deciding whether a member looks quiet. A second notion of
// "meaningful" would mark a member sleepy on the very commits its own scheduler counts
// as movement.
//
// Import-light and free of `node:` on purpose, like dormancy.mjs: the dashboard reads
// this in the browser through the pack's published public/.

import { taskFromMessage } from '../../public/work-item-grammar.mjs';

// Bot/CI housekeeping and Claudinite's own automated writes, by MESSAGE. The queue's
// own vocabulary (`[claudinite-task]`, `[claudinite-work]`) is excluded here so
// neither dispatch mechanism ever self-triggers: a queue-mode repo's work items are
// repo activity to every precondition watching issues.
export const HOUSEKEEPING = /\[skip ci\]|(^|\n)\s*baselin(e|ing)\b|claudinite[ -](baselin|maintenance|growth|task|work)|seed default-on/i;

// The exclusion the message cannot express: a commit that touched nothing outside
// `.claudinite/` moved the repo's own working rules, not the project. Every consumer
// means "genuine project work" by this — something shippable changed (store-release),
// there is a lesson to extract (growth-extract), a comment may have drifted
// (improve-comments) — and none of those is true of a corpus edit. Message and author
// cannot catch it: a human landing a lesson PR writes an ordinary message under their
// own login, so the growth lifecycle's own landed output re-armed it the next night
// and a repo could never go quiet (TLDR #319).
//
// An empty list is UNKNOWN, never "touched only .claudinite/" — a bare `every` is
// vacuously true on it and would silently retire the trigger for every commit whose
// detail read failed. Require at least one known path before the exclusion applies.
const CORPUS_ONLY = (files) => files.length > 0 && files.every((f) => f.startsWith('.claudinite/'));

// The test. `files` is the commit's changed paths where the caller resolved them, and
// `null` where it did not: a reader working from a commit LISTING has no file list and
// cannot afford a read per commit, so it gets the author, trailer and message
// exclusions and states that the corpus-only one did not run. The trailer is the
// AUTHORITY for anything written after it existed — a commit a scheduled task wrote
// says so itself — and the message and author exclusions stay because history
// predating the trailer still needs classifying and because they also cover
// non-task housekeeping.
export function isSubstantiveCommit(commit, files = null) {
  const login = commit?.author?.login ?? commit?.author ?? '';
  if (typeof login === 'string' && login.endsWith('[bot]')) return false;
  const message = commit?.commit?.message ?? commit?.message ?? '';
  if (taskFromMessage(message)) return false;
  if (files !== null && CORPUS_ONLY(files)) return false;
  return !HOUSEKEEPING.test(message);
}
