// Puzzle model: page Snapshot → crossword semantics (REQ-MODEL-*). Pure.
// Numbering and clue↔cell mapping are DERIVED from grid geometry (standard rules),
// then cross-checked against the numbers printed in the DOM (REQ-MODEL-001) so page
// drift is detected instead of silently trusted.

/**
 * @param {object} snapshot  see docs/ARCHITECTURE.md §3
 * @param {object} [overlay]
 * @param {Record<number, string>} [overlay.softCells]  session ledger of cells the
 *   extension itself penciled (index → letter, REQ-ANS-019). The live page exposes no
 *   readable pencil marker (REQ-PAGE-012), so these count as penciled too — as long as
 *   the cell still holds the letter we penciled (any other letter means the record is
 *   stale and is ignored).
 */
export function buildModel(snapshot, { softCells = {} } = {}) {
  const { rows, cols } = snapshot.size;
  const cells = [...snapshot.cells].sort((a, b) => a.index - b.index);
  const at = (r, c) => (r < 0 || c < 0 || r >= rows || c >= cols) ? null : cells[r * cols + c];
  const open = (r, c) => {
    const cell = at(r, c);
    return cell ? !cell.block : false;
  };

  // Standard numbering: a cell is numbered iff it starts an across or down entry of length ≥ 2.
  const entries = [];
  let num = 0;
  let numberingMismatch = false;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (!open(r, c)) continue;
      const startsAcross = !open(r, c - 1) && open(r, c + 1);
      const startsDown = !open(r - 1, c) && open(r + 1, c);
      if (!startsAcross && !startsDown) continue;
      num++;
      const domNumber = at(r, c).number;
      if (domNumber != null && domNumber !== num) numberingMismatch = true;
      if (startsAcross) {
        const cellIndices = [];
        for (let cc = c; open(r, cc); cc++) cellIndices.push(r * cols + cc);
        entries.push({ id: `A${num}`, number: num, direction: 'across', cellIndices });
      }
      if (startsDown) {
        const cellIndices = [];
        for (let rr = r; open(rr, c); rr++) cellIndices.push(rr * cols + c);
        entries.push({ id: `D${num}`, number: num, direction: 'down', cellIndices });
      }
    }
  }

  const snapshotCluesById = new Map(snapshot.clues.map((cl) => [cl.id, cl]));
  const clueById = new Map();
  for (const e of entries) {
    const fromPage = snapshotCluesById.get(e.id);
    clueById.set(e.id, {
      ...e,
      label: `${e.number} ${e.direction === 'across' ? 'Across' : 'Down'}`,
      runs: fromPage?.runs ?? [],
    });
  }

  const orderedClueIds = [
    ...entries.filter((e) => e.direction === 'across'),
    ...entries.filter((e) => e.direction === 'down'),
  ].sort((a, b) => (a.direction === b.direction ? a.number - b.number
    : a.direction === 'across' ? -1 : 1))
    .map((e) => e.id);

  const letterAt = (i) => {
    const raw = (cells[i]?.letter ?? '').trim().toUpperCase();
    return raw ? raw[0] : null;
  };
  // Missing on older snapshots → false: an unknown pencil state reads as pen.
  // The soft-cell ledger fills in for the page's unreadable marker (REQ-ANS-023).
  const penciledAt = (i) => letterAt(i) != null
    && (Boolean(cells[i]?.penciled) || softCells[i] === letterAt(i));

  const model = {
    snapshot,
    size: snapshot.size,
    numberingMismatch,
    orderedClueIds,
    clueById,

    clue(clueId) {
      return clueById.get(clueId) ?? null;
    },
    labelFor(clueId) {
      return clueById.get(clueId)?.label ?? clueId;
    },
    /** Entry letters in order; null for empty cells (REQ-MODEL-003). */
    patternFor(clueId) {
      const clue = clueById.get(clueId);
      return clue ? clue.cellIndices.map(letterAt) : [];
    },
    /** Per-cell pencil flags in entry order, aligned with patternFor (REQ-ANS-019). */
    pencilFor(clueId) {
      const clue = clueById.get(clueId);
      return clue ? clue.cellIndices.map(penciledAt) : [];
    },
    progressFor(clueId) {
      const pattern = model.patternFor(clueId);
      return { filled: pattern.filter(Boolean).length, length: pattern.length };
    },
    /** Full current word if the entry is completely filled, else null. */
    wordFor(clueId) {
      const pattern = model.patternFor(clueId);
      return pattern.length && pattern.every(Boolean) ? pattern.join('') : null;
    },
    /** Crossing clue at a 0-based position of the entry (REQ-MODEL-002). */
    crossingAt(clueId, pos) {
      const clue = clueById.get(clueId);
      if (!clue) return null;
      const cellIndex = clue.cellIndices[pos];
      for (const other of clueById.values()) {
        if (other.direction !== clue.direction && other.cellIndices.includes(cellIndex)) {
          return { clueId: other.id, label: other.label };
        }
      }
      return null;
    },
    /** Cells payload for the page writer. */
    cellsForWord(clueId, word) {
      const clue = clueById.get(clueId);
      return clue.cellIndices.map((index, i) => ({ index, letter: word[i] }));
    },
    /**
     * Cells to soften to pencil when `word` overwrites conflicting letters in `clueId`
     * (REQ-ANS-019): the surviving letters of every crossing entry that loses a letter,
     * except letters corroborated by another completely filled entry and letters
     * already penciled. Empty when the write conflicts with nothing.
     * @returns {Array<{index: number, letter: string}>}
     */
    pencilPlanFor(clueId, word) {
      const clue = clueById.get(clueId);
      if (!clue) return [];
      const own = new Set(clue.cellIndices);
      const plan = new Map(); // index → letter; deduped across malformed entries
      clue.cellIndices.forEach((cellIndex, i) => {
        const have = letterAt(cellIndex);
        if (!have || have === word[i]) return; // nothing lost at this cell
        const cross = model.crossingAt(clueId, i);
        if (!cross) return;
        const malformed = clueById.get(cross.clueId);
        malformed.cellIndices.forEach((survivor, j) => {
          if (own.has(survivor) || plan.has(survivor)) return; // the new word's cell / seen
          const letter = letterAt(survivor);
          if (!letter || penciledAt(survivor)) return; // empty, or already soft
          const corroborator = model.crossingAt(cross.clueId, j);
          if (corroborator && model.wordFor(corroborator.clueId)) return; // part of a full entry
          plan.set(survivor, letter);
        });
      });
      return [...plan.entries()].map(([index, letter]) => ({ index, letter }));
    },
    isFull() {
      return cells.every((c) => c.block || letterAt(c.index));
    },
    isSolved() {
      return snapshot.status === 'solved';
    },
    firstUnfilled() {
      return orderedClueIds.find((id) => {
        const p = model.progressFor(id);
        return p.filled < p.length;
      }) ?? orderedClueIds[0] ?? null;
    },
  };
  return model;
}
