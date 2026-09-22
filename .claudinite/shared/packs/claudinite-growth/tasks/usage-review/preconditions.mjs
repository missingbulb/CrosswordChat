// usage-review's own two terms.
//
// Neither is expressible in the built-in vocabulary: the movement conditions read
// the project's commits, issues, pull requests and captures, and this review's
// trigger is neither - it is the FOLD having moved, which is machinery, and the
// window holding enough sessions to say anything at all. Both read files the
// checkout already carries, so they cost no API call on a term asked every tick.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readUsageFile, USAGE_PATH } from './read-record.mjs';
import { REVIEW_PATH } from './report.mjs';

const repoRoot = () => process.env.CLAUDINITE_REPO_ROOT || process.cwd();

const foldedThrough = (root) => readUsageFile(root)?.foldedThrough ?? null;

const reviewedThrough = (root) => {
  try { return JSON.parse(readFileSync(join(root, REVIEW_PATH), 'utf8')).window?.to ?? null; }
  catch { return null; }
};

// The sessions the fold carries for the trailing window - the denominator every
// rate rule divides by. Under ten, a rate says more about the window than about the
// subject, so the review declines rather than publishing findings nobody should act
// on.
export function windowSessions(root, days = 28) {
  const file = readUsageFile(root);
  if (!file?.days) return 0;
  const fields = file.fields?.day ?? [];
  const at = fields.indexOf('sessions');
  if (at < 0) return 0;
  const dates = Object.keys(file.days).sort().slice(-days);
  return dates.reduce((n, d) => {
    const value = file.days[d]?.totals?.[at];
    return n + (typeof value === 'number' ? value : 0);
  }, 0);
}

export const terms = {
  // The fold's watermark against the review's own. A review whose window already
  // ends where the fold does has read everything there is, and running it again
  // would recompute the same answer and deliver a byte-identical file.
  'fold-moved-since-review': {
    signals: [],
    holds() {
      const root = repoRoot();
      const fold = foldedThrough(root);
      if (!fold) return { holds: false, reason: `no ${USAGE_PATH} yet - there is no record to review` };
      const reviewed = reviewedThrough(root);
      if (!reviewed) return { holds: true, reason: `folded through ${fold} and never reviewed` };
      return fold > reviewed
        ? { holds: true, reason: `folded through ${fold}, reviewed through ${reviewed}: there are days the review has not read` }
        : { holds: false, reason: `reviewed through ${reviewed}, and the fold has not moved past it` };
    },
  },

  'window-has-sessions': {
    signals: [],
    takesArg: true,
    holds(_signals, { arg }) {
      const need = Number(arg);
      if (!Number.isFinite(need) || need < 1) return { error: `window-has-sessions needs a positive count, got ${arg}` };
      const have = windowSessions(repoRoot());
      return have >= need
        ? { holds: true, reason: `${have} sessions in the window, at or above the ${need} the rates need` }
        : { holds: false, reason: `${have} sessions in the window, under the ${need} a rate can be read against` };
    },
  },
};
