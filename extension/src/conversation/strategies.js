// Next-clue selection strategies (REQ-NAV-002/003/004/011). Pure.

// 'most-filled' is a PERSISTED id — saved in chrome.storage and spoken by voice
// commands — so it is FROZEN: don't rename it even though REQ-NAV-004 now ranks by
// FEWEST-OPEN letters (not most-placed); a rename silently breaks every user's saved
// setting. The name still reads colloquially as "most nearly done".
export const STRATEGIES = ['list-order', 'most-filled'];

// How "open" a penciled cell counts when ranking most-filled (REQ-NAV-004): a penciled
// letter is real progress but unconfirmed, so its cell is HALF-open, not closed.
const PENCIL_OPEN = 0.5;

function unfilledIds(model) {
  return model.orderedClueIds.filter((id) => {
    const p = model.progressFor(id);
    return p.filled < p.length;
  });
}

/**
 * Ids of the clues that CROSS `fromId` — the perpendicular entries sharing one of its
 * cells (REQ-NAV-004 crossing tiebreak). Solving any of them fills a letter of `fromId`,
 * so at equal closeness one of these is offered before a clue that never touches the
 * current entry. Empty set when `fromId` is unknown.
 */
function crossingIds(model, fromId) {
  const clue = model.clue(fromId);
  if (!clue) return new Set();
  const ids = new Set();
  clue.cellIndices.forEach((_, pos) => {
    const cross = model.crossingAt(fromId, pos);
    if (cross) ids.add(cross.clueId);
  });
  return ids;
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
    // Closest-to-done first: the FEWEST open (still-blank) letters, so the entry that
    // needs the least work to finish is offered first (REQ-NAV-004). Open letters — not
    // letters already placed — is the right metric: ranking by count-placed let a long
    // entry with many blanks outrank a short one needing a single letter, so the long one
    // got suggested over and over while the near-finished clue waited. A penciled cell is
    // the solver's own "not sure" mark (REQ-ANS-023 — real progress, but shaky), so it
    // counts as half-open, not closed.
    //
    // Equal open counts break by one of two chains, chosen by whether the CURRENT entry
    // holds any letter (REQ-NAV-004). A BLANK current entry (no letters at all) anchors no
    // area to build around, so ties do NOT jump to a crossing clue — they move to the next
    // entry in the SAME direction by number, wrapping to the first (plain sequential
    // movement, direction preserved); other-direction entries come up only when the same
    // direction is dry. Otherwise ties break FIRST toward a clue that CROSSES the current
    // entry — the intersecting answer sits where the solver is working and finishing it
    // fills a letter here — then to the one NEAREST in list order (forward wins an
    // exact-distance tie). List order is the final tiebreak either way; current clue last.
    const others = candidates.filter((id) => id !== fromId);
    const order = model.orderedClueIds;
    const from = Math.max(order.indexOf(fromId), 0);
    const openLetters = (id) => {
      const pattern = model.patternFor(id);
      const pencil = model.pencilFor(id);
      return pattern.reduce((sum, letter, i) => sum + (letter ? (pencil[i] ? PENCIL_OPEN : 0) : 1), 0);
    };
    const dist = (id) => Math.abs(order.indexOf(id) - from);

    const currentClue = model.clue(fromId);
    const currentBlank = currentClue != null && model.progressFor(fromId).filled === 0;
    let tiebreak;
    if (currentBlank) {
      // Same-direction entries in numerical order, walked forward from the current one and
      // wrapping; other-direction entries sort after them, nearest first (REQ-NAV-004 edge).
      const sameDir = order.filter((id) => model.clue(id).direction === currentClue.direction);
      const fromPos = sameDir.indexOf(fromId);
      const walkPos = (id) => {
        const p = sameDir.indexOf(id);
        return p < 0 ? sameDir.length + dist(id) : (p - fromPos + sameDir.length) % sameDir.length;
      };
      tiebreak = (a, b) => walkPos(a) - walkPos(b);
    } else {
      const crosses = crossingIds(model, fromId);
      const crossRank = (id) => (crosses.has(id) ? 0 : 1); // crossing the current clue sorts first
      tiebreak = (a, b) => crossRank(a) - crossRank(b)
        || dist(a) - dist(b)
        || (order.indexOf(b) > from) - (order.indexOf(a) > from);
    }
    const fresh = others
      .filter((id) => !avoid.includes(id))
      .sort((a, b) => openLetters(a) - openLetters(b)
        || tiebreak(a, b)
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
