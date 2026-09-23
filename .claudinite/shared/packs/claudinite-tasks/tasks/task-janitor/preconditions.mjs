// task-janitor's own precondition term.
//
// WHY IT EXISTS. The janitor's gate was its cadence and nothing else, which cannot
// decline: it filed an item every day whether or not the queue had anything wrong
// with it, and a repo whose machinery is healthy paid one issue, one executor run
// and one closed-the-same-hour receipt per day to be told so. The janitor is the
// FALLBACK LANE, so every run of it is a claim that something already went wrong -
// and on most days nothing has.
//
// WHAT IT ASKS is the sweep's own question, one step cheaper: would any rule claim
// an item? The rules are pure functions over the open queue, so the term CALLS
// THEM rather than restating their conditions - a restated clock is one that drifts
// from the rule it was copied off, and this gate going quiet is silent.
//
// THE THREE IT CANNOT CALL - superseded (E), ended (G) and orphaned (F) parks -
// each need a read the sweep makes and a precondition must not: the closed half of
// the queue, an `Ends-when` target, the task index at HEAD. All three act only on a
// PARKED item, so one line covers them: a park holds, whatever kind. That is also
// the honest posture - a park is a person's, and a term that slept through one
// would be deciding on their behalf.
//
// THE DEFAULTS ARE PERMISSIVE ON PURPOSE. Called without its lookup, each rule
// claims at least what the real sweep claims: `staleReadyItems` falls back to a
// one-day period where the real one reads the task's own (never shorter),
// `deadAgentItems` judges off the item clock where a progress beat is newer, and
// `stuckBlockedItems` treats a blocker it cannot read as unresolved. So the term's
// claim set is a superset of the sweep's, which is the only direction that is safe
// here: a spurious run costs one issue, and a wrong decline costs a repair nobody
// is ever asked to make.

import {
  staleReadyItems, deadAgentItems, stuckBlockedItems, statelessItems, unclosedTerminalItems,
} from '../../src/recover/janitor-rules.mjs';
import { isParked } from '../../public/work-item-grammar.mjs';

export const terms = {
  'queue-needs-sweep': {
    signals: ['queue'],
    holds(signals, { now }) {
      const queue = signals.queue;
      // NOT a decline. A queue that could not be read looks exactly like a healthy
      // one, and this is the lane that has no second chance: nothing else repairs a
      // torn item, so a decline taken on a read that failed is permanent.
      if (!queue) return { error: 'no queue signal - the open work-item list was not collected' };
      if (queue.error) return { error: `the open queue could not be read - ${queue.error}` };

      const open = queue.open ?? [];
      const at = new Date(now);
      const claimed = [
        ['parked', open.filter(isParked)],
        ['stale-ready', staleReadyItems(open, at)],
        ['dead-agent', deadAgentItems(open, at)],
        ['stuck-blocked', stuckBlockedItems(open, at)],
        ['stateless', statelessItems(open)],
        ['unclosed-terminal', unclosedTerminalItems(open, at)],
      ];
      const hits = claimed.filter(([, items]) => items.length);
      if (!hits.length) {
        return {
          holds: false,
          reason: `${open.length} open item(s), every one live, statused and inside its clocks - nothing for the janitor to repair`,
        };
      }
      return {
        holds: true,
        reason: hits.map(([rule, items]) => `${rule}: ${items.map((i) => `#${i.number}`).join(', ')}`).join('; '),
      };
    },
  },
};
