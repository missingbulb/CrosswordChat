// Next-clue selection strategies (REQ-NAV-002/003/004/011). Pure.

// 'most-filled' is a PERSISTED id — saved in chrome.storage and spoken by voice
// commands — so it is FROZEN: don't rename it. It reads literally: REQ-NAV-004 ranks by
// the MOST letters already PLACED (the entry the solver has made the most headway on),
// so a rename would only risk breaking every user's saved setting for no gain.
export const STRATEGIES = ['list-order', 'most-filled'];

// How much a penciled cell counts toward "placed" when ranking most-filled (REQ-NAV-004):
// a penciled letter is real progress but unconfirmed, so it counts as HALF a placed
// letter, not a whole one.
const PENCIL_PLACED = 0.5;

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
    // Most-headway first: the MOST letters already PLACED, so the entry the solver has made
    // the most progress on is offered first (REQ-NAV-004). Letters placed — not gaps
    // remaining — is the metric: a long entry the solver has partly filled (say 3 of 10)
    // outranks a random untouched short entry (a blank 3-letter), because the partly-filled
    // one is where the work and the momentum are; finishing what you started beats detouring
    // to an easy but untouched word. A penciled cell is the solver's own "not sure" mark
    // (REQ-ANS-023 — real progress, but shaky), so it counts as half a placed letter.
    //
    // Equal placed counts break by one of two chains, chosen by whether the CURRENT entry
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
    const placedLetters = (id) => {
      const pattern = model.patternFor(id);
      const pencil = model.pencilFor(id);
      return pattern.reduce((sum, letter, i) => sum + (letter ? (pencil[i] ? PENCIL_PLACED : 1) : 0), 0);
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
      .sort((a, b) => placedLetters(b) - placedLetters(a)
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
