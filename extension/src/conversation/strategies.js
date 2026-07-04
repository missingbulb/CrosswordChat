// Next-clue selection strategies (REQ-NAV-002/003/004). Pure.

export const STRATEGIES = ['list-order', 'most-filled'];

function unfilledIds(model) {
  return model.orderedClueIds.filter((id) => {
    const p = model.progressFor(id);
    return p.filled < p.length;
  });
}

/**
 * @returns {{clueId: string, wrapped: boolean} | null}  null when nothing is unfilled.
 */
export function nextClue(model, fromId, strategy = 'list-order') {
  const candidates = unfilledIds(model);
  if (!candidates.length) return null;

  if (strategy === 'most-filled') {
    // Most letters already in place first; ties by list order; current clue last resort.
    const ranked = candidates
      .filter((id) => id !== fromId)
      .map((id) => ({ id, filled: model.progressFor(id).filled, order: model.orderedClueIds.indexOf(id) }))
      .sort((a, b) => b.filled - a.filled || a.order - b.order);
    return { clueId: (ranked[0] ?? { id: fromId }).id, wrapped: false };
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
