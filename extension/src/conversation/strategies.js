// Next-clue selection strategies (REQ-NAV-002/003/004/011). Pure.

export const STRATEGIES = ['list-order', 'most-filled'];

// What a penciled letter is worth relative to a pen letter when ranking most-filled
// (REQ-NAV-004): real help, but unconfirmed — half.
const PENCIL_WORTH = 0.5;

function unfilledIds(model) {
  return model.orderedClueIds.filter((id) => {
    const p = model.progressFor(id);
    return p.filled < p.length;
  });
}

/**
 * @param {string[]} avoid  recently skipped clue ids, oldest skip first (REQ-NAV-011);
 *   honored by most-filled only — list order has a fixed path and cannot loop.
 * @returns {{clueId: string} | null}  null when nothing is unfilled.
 */
export function nextClue(model, fromId, strategy = 'list-order', avoid = []) {
  const candidates = unfilledIds(model);
  if (!candidates.length) return null;

  if (strategy === 'most-filled') {
    // Easiest first: the MOST letters already in place (count, not ratio — 3/5 beats
    // 2/3, REQ-NAV-004), with penciled letters worth half a pen letter (they are the
    // solver's own "not sure" marks, REQ-ANS-023 — help, but shaky help); equal scores
    // go to the clue NEAREST the current one in list order (smallest jump; forward
    // wins an exact-distance tie), then list order; current clue last resort.
    const others = candidates.filter((id) => id !== fromId);
    const order = model.orderedClueIds;
    const from = Math.max(order.indexOf(fromId), 0);
    const score = (id) => {
      const pattern = model.patternFor(id);
      const pencil = model.pencilFor(id);
      return pattern.reduce((sum, letter, i) => sum + (letter ? (pencil[i] ? PENCIL_WORTH : 1) : 0), 0);
    };
    const dist = (id) => Math.abs(order.indexOf(id) - from);
    const fresh = others
      .filter((id) => !avoid.includes(id))
      .sort((a, b) => score(b) - score(a)
        || dist(a) - dist(b)
        || (order.indexOf(b) > from) - (order.indexOf(a) > from)
        || order.indexOf(a) - order.indexOf(b));
    if (fresh.length) return { clueId: fresh[0] };
    // Every open clue was skipped recently and is unchanged: cycle back to the one
    // skipped longest ago instead of getting stuck (REQ-NAV-011).
    const stale = avoid.find((id) => others.includes(id));
    return { clueId: stale ?? fromId };
  }

  // list-order (default): next unfilled after fromId, cycling past the end (REQ-NAV-002).
  const order = model.orderedClueIds;
  const start = Math.max(order.indexOf(fromId), 0);
  for (let step = 1; step <= order.length; step++) {
    const i = (start + step) % order.length;
    if (candidates.includes(order[i])) return { clueId: order[i] };
  }
  return null;
}

/**
 * Previous clue in list order, wrapping from the first Across to the last Down
 * (REQ-NAV-009). Unlike nextClue, filled entries are NOT skipped — "back" exists
 * to revisit and fix what is already there. This is "back"'s whole meaning under
 * list order; under most-filled the machine retraces its own visited trail first
 * and falls back to this only once the trail runs dry.
 * @returns {{clueId: string}}
 */
export function prevClue(model, fromId) {
  const order = model.orderedClueIds;
  const start = Math.max(order.indexOf(fromId), 0);
  return { clueId: order[(start - 1 + order.length) % order.length] };
}
