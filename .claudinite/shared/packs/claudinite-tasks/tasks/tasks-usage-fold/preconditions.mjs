// tasks-usage-fold's own precondition term.
//
// The fold's trigger is MOVEMENT IN THE MACHINERY — a scheduler tick or an executor
// run that this file has not counted yet — and no built-in term can say that: every
// movement condition reads the project's commits, issues, pull requests and
// captures, and a repo whose only activity is its own queue is silent by all four.
//
// What the term reads instead is the file's OWN WATERMARK, which is the cheapest
// honest evidence there is: `runsFoldedThrough` advances on every fold that read a
// run, so a mark still standing before the scheduler's most recent anchor means at
// least one tick has come and gone unfolded. That is the mark's own movement rather
// than standing state — it flips false the moment a fold catches up, and true again
// at the next tick — and it costs no API call at all, which matters on a term asked
// at every tick of every day.
//
// WHAT IT CANNOT SEE, stated rather than implied: it does not know how MANY runs are
// waiting, only that the mark is behind. A repo whose scheduler has stopped
// entirely is not asked at all, so there is nothing for this term to decline there.

import { readFileSync } from 'node:fs';
import { mostRecentAnchor } from '../../src/items/anchors.mjs';
import { decodeTasksUsageFile, TASKS_USAGE_PATH } from '../../src/items/tasks-usage-format.mjs';

// The mark the last fold left, read from the checkout the run holds. Null for a repo
// that has never folded — which is movement by definition, since everything its
// machinery has ever done is unread.
export function foldedThroughAt(root) {
  try {
    return decodeTasksUsageFile(JSON.parse(readFileSync(`${root}/${TASKS_USAGE_PATH}`, 'utf8'))).runsFoldedThrough;
  } catch {
    return null;
  }
}

export const terms = {
  'runs-since-fold': {
    signals: [],
    holds(_signals, { now }) {
      // The scheduler and the executor both run with the checkout as their working
      // directory, and the fold's own worker takes the same root the same way.
      const root = process.env.CLAUDINITE_REPO_ROOT || process.cwd();
      const mark = foldedThroughAt(root);
      if (!mark) return { holds: true, reason: 'nothing has been folded yet — every run this repo has made is uncounted' };
      const at = mostRecentAnchor('daily', now).toISOString();
      return mark < at
        ? { holds: true, reason: `runs are folded through ${mark}, before this UTC day opened at ${at}: the machinery has run since` }
        : { holds: false, reason: `runs are folded through ${mark}, inside the UTC day that opened at ${at}: nothing has run since the last fold` };
    },
  },
};
