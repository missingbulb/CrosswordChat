// Snapshot builders for pure-logic tests (model, strategies, machine).
// Grid rows use: '#' block, '.' empty cell, letter = filled cell —
// UPPERCASE in pen, lowercase penciled (REQ-ANS-019).

import { parseClueHtml } from '../../extension/src/page-adapter/clue-html.js';
import { FIXTURE_PUZZLE } from '../fixtures/fake-nyt/puzzle.js';

/**
 * @param {string[]} rows
 * @param {object} [opts]
 * @param {Record<string, string|Array>} [opts.clues]  id → plain text | runs
 * @param {{clueId?: string|null, cellIndex?: number|null}} [opts.selection]
 * @param {'active'|'solved'|'not-found'} [opts.status]
 */
export function makeSnapshot(rows, { clues = {}, selection = {}, status = 'active' } = {}) {
  const rowCount = rows.length;
  const cols = rows[0].length;
  const cells = [];
  for (let r = 0; r < rowCount; r++) {
    for (let c = 0; c < cols; c++) {
      const ch = rows[r][c];
      cells.push({
        index: r * cols + c,
        row: r,
        col: c,
        block: ch === '#',
        letter: /[A-Za-z]/.test(ch) ? ch.toUpperCase() : '',
        penciled: /[a-z]/.test(ch), // lowercase = penciled letter
        number: null, // model derives numbering; tests assert against hand-computed values
      });
    }
  }
  const clueList = Object.entries(clues).map(([id, value]) => ({
    id,
    number: Number(id.slice(1)),
    direction: id[0] === 'A' ? 'across' : 'down',
    runs: typeof value === 'string' ? [{ text: value, italic: false }] : value,
  }));
  return {
    status,
    size: { rows: rowCount, cols },
    cells,
    clues: clueList,
    selection: { clueId: selection.clueId ?? null, cellIndex: selection.cellIndex ?? null },
  };
}

/** Clue runs for the HEART fixture puzzle, parsed from the same HTML the fake page renders. */
export function heartClues() {
  const map = {};
  for (const clue of FIXTURE_PUZZLE.across) map[`A${clue.number}`] = parseClueHtml(clue.html);
  for (const clue of FIXTURE_PUZZLE.down) map[`D${clue.number}`] = parseClueHtml(clue.html);
  return map;
}

export const EMPTY_HEART_ROWS = ['.....', '.....', '.....', '.....', '.....'];
export const SOLVED_HEART_ROWS = [...FIXTURE_PUZZLE.solution];

/** Standard 5×5 HEART-puzzle snapshot. */
export function heartSnapshot(rows = EMPTY_HEART_ROWS, opts = {}) {
  return makeSnapshot(rows, { clues: heartClues(), ...opts });
}
