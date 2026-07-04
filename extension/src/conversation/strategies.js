// Next-clue selection strategies (REQ-NAV-002/003/004/011). Pure.

export const STRATEGIES = ['list-order', 'most-filled'];

function unfilledIds(model) {
  return model.orderedClueIds.filter((id) => {
    const p = model.progressFor(id);
    return p.filled < p.length;
  });
}

/**
 * @param {string[]} avoid  recently skipped clue ids, oldest skip first (REQ-NAV-011);
 *   honored by most-filled only — list order has a fixed path and cannot loop.
 * @returns {{clueId: string, wrapped: boolean} | null}  null when nothing is unfilled.
 */
export function nextClue(model, fromId, strategy = 'list-order', avoid = []) {
  const candidates = unfilledIds(model);
  if (!candidates.length) return null;

  if (strategy === 'most-filled') {
    // Easiest first: highest share of letters already in place (ratio, not count —
    // 2/3 beats 3/5, REQ-NAV-004); ties by list order; current clue last resort.
    const others = candidates.filter((id) => id !== fromId);
    const ratio = (id) => {
      const p = model.progressFor(id);
      return p.filled / p.length;
    };
    const fresh = others
      .filter((id) => !avoid.includes(id))
      .sort((a, b) => ratio(b) - ratio(a)
        || model.orderedClueIds.indexOf(a) - model.orderedClueIds.indexOf(b));
    if (fresh.length) return { clueId: fresh[0], wrapped: false };
    // Every open clue was skipped recently and is unchanged: cycle back to the one
    // skipped longest ago instead of getting stuck (REQ-NAV-011).
    const stale = avoid.find((id) => others.includes(id));
    return { clueId: stale ?? fromId, wrapped: false };
  }

  // list-order (default): next unfilled after fromId, cycling past the end (REQ-NAV-002/006).
  const order = model.orderedClueIds;
  const start = Math.max(order.indexOf(fromId), 0);
  for (let step = 1; step <= order.length; step++) {
    const i = (start + step) % order.length;
    if (candidates.includes(order[i])) {
      return { clueId: order[i], wrapped: start + step >= order.length };
    }
  }
  return null;
}

/**
 * Previous clue in list order, wrapping from the first Across to the last Down
 * (REQ-NAV-009). Unlike nextClue, filled entries are NOT skipped — "back" exists
 * to revisit and fix what is already there. Always list order, whatever the
 * active strategy: "previous" has no stable meaning under most-filled.
 * @returns {{clueId: string}}
 */
export function prevClue(model, fromId) {
  const order = model.orderedClueIds;
  const start = Math.max(order.indexOf(fromId), 0);
  return { clueId: order[(start - 1 + order.length) % order.length] };
}
