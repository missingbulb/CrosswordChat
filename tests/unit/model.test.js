import { describe, test, expect } from 'vitest';
import { buildModel } from '../../extension/src/puzzle-model/model.js';
import { makeSnapshot, heartSnapshot, SOLVED_HEART_ROWS } from '../helpers/snapshots.js';

// 4×4 with two blocks — numbering hand-computed:
//   # . . .     across: A1 (r0 c1–3), A4 (r1), A5 (r2), A6 (r3 c0–2)
//   . . . .     down:   D1 (c1), D2 (c2), D3 (c3 r0–2), D4 (c0 r1–3)
//   . . . .
//   . . . #
const BLOCKED = ['#...', '....', '....', '...#'];

describe('puzzle model', () => {
  test('REQ-MODEL-001: numbering and clue↔cell mapping on a blockless grid', () => {
    const model = buildModel(heartSnapshot());
    expect(model.clue('A1').cellIndices).toEqual([0, 1, 2, 3, 4]);
    expect(model.clue('A6').cellIndices).toEqual([5, 6, 7, 8, 9]);
    expect(model.clue('A9').cellIndices).toEqual([20, 21, 22, 23, 24]);
    expect(model.clue('D1').cellIndices).toEqual([0, 5, 10, 15, 20]);
    expect(model.clue('D5').cellIndices).toEqual([4, 9, 14, 19, 24]);
    expect(model.clue('D6')).toBeNull(); // downs are 1–5 on this grid
  });

  test('REQ-MODEL-001: numbering with blocks matches the hand-computed expectation', () => {
    const model = buildModel(makeSnapshot(BLOCKED));
    const byId = (id) => model.clue(id)?.cellIndices;
    expect(byId('A1')).toEqual([1, 2, 3]);
    expect(byId('A4')).toEqual([4, 5, 6, 7]);
    expect(byId('A5')).toEqual([8, 9, 10, 11]);
    expect(byId('A6')).toEqual([12, 13, 14]);
    expect(byId('D1')).toEqual([1, 5, 9, 13]);
    expect(byId('D2')).toEqual([2, 6, 10, 14]);
    expect(byId('D3')).toEqual([3, 7, 11]);
    expect(byId('D4')).toEqual([4, 8, 12]);
    expect(model.orderedClueIds).toEqual(['A1', 'A4', 'A5', 'A6', 'D1', 'D2', 'D3', 'D4']);
  });

  test('REQ-MODEL-002: crossings resolve to the perpendicular clue with a label', () => {
    const model = buildModel(heartSnapshot());
    expect(model.crossingAt('A1', 2)).toEqual({ clueId: 'D3', label: '3 Down' });
    expect(model.crossingAt('D5', 0)).toEqual({ clueId: 'A1', label: '1 Across' });
    const blocked = buildModel(makeSnapshot(BLOCKED));
    expect(blocked.crossingAt('A6', 0)).toEqual({ clueId: 'D4', label: '4 Down' });
  });

  test('REQ-MODEL-003: pattern and progress reflect the grid exactly', () => {
    const model = buildModel(heartSnapshot(['HEA.T', '.....', '.....', '.....', '.....']));
    expect(model.patternFor('A1')).toEqual(['H', 'E', 'A', null, 'T']);
    expect(model.progressFor('A1')).toEqual({ filled: 4, length: 5 });
    expect(model.patternFor('D1')).toEqual(['H', null, null, null, null]);
    expect(model.wordFor('A1')).toBeNull();
    const full = buildModel(heartSnapshot(SOLVED_HEART_ROWS));
    expect(full.wordFor('A1')).toBe('HEART');
  });

  test('REQ-MODEL-004: grid-full and solved are independent signals', () => {
    const fullNotSolved = buildModel(heartSnapshot(SOLVED_HEART_ROWS, { status: 'active' }));
    expect(fullNotSolved.isFull()).toBe(true);
    expect(fullNotSolved.isSolved()).toBe(false);
    const solved = buildModel(heartSnapshot(SOLVED_HEART_ROWS, { status: 'solved' }));
    expect(solved.isSolved()).toBe(true);
    const empty = buildModel(heartSnapshot());
    expect(empty.isFull()).toBe(false);
  });

  test('REQ-MODEL-005: canonical order is Across by number, then Down by number', () => {
    const model = buildModel(heartSnapshot());
    expect(model.orderedClueIds).toEqual(['A1', 'A6', 'A7', 'A8', 'A9', 'D1', 'D2', 'D3', 'D4', 'D5']);
  });

  test('REQ-MODEL-001: clue runs from the page attach to derived entries', () => {
    const model = buildModel(heartSnapshot());
    expect(model.clue('A9').runs.map((r) => r.text).join('')).toBe('It might go viral?');
    expect(model.clue('A6').runs.some((r) => r.italic)).toBe(true);
  });

  test('firstUnfilled skips completed entries', () => {
    const model = buildModel(heartSnapshot(['HEART', '.....', '.....', '.....', '.....']));
    expect(model.firstUnfilled()).toBe('A6');
  });
});

describe('pencil semantics (REQ-ANS-019)', () => {
  test('REQ-ANS-019: pencilFor mirrors per-cell pencil state, aligned with the pattern', () => {
    const model = buildModel(heartSnapshot(['HEa.T', '.....', '.....', '.....', '.....']));
    expect(model.patternFor('A1')).toEqual(['H', 'E', 'A', null, 'T']); // case-independent letters
    expect(model.pencilFor('A1')).toEqual([false, false, true, false, false]);
    expect(model.pencilFor('D3')).toEqual([true, false, false, false, false]);
  });

  test('REQ-ANS-019: the plan pencils the malformed crossing\'s surviving letters', () => {
    // A1 reads HEA_T; its crossing D3 also holds B and U further down. HEIST loses
    // D3's A, so B and U (corroborated by nothing full) get penciled.
    const model = buildModel(heartSnapshot(['HEA.T', '..B..', '..U..', '.....', '.....']));
    expect(model.pencilPlanFor('A1', 'HEIST')).toEqual([
      { index: 7, letter: 'B' },
      { index: 12, letter: 'U' },
    ]);
  });

  test('REQ-ANS-019: letters that belong to another completely filled entry keep their pen', () => {
    // Same override, but D3's B is also the B of the fully filled A6 (EMBER) — a full
    // definition still corroborates it, so only the U is softened.
    const model = buildModel(heartSnapshot(['HEA.T', 'EMBER', '..U..', '.....', '.....']));
    expect(model.pencilPlanFor('A1', 'HEIST')).toEqual([{ index: 12, letter: 'U' }]);
  });

  test('REQ-ANS-019: several collisions pencil all their crossings; the plan never includes the new word\'s own cells', () => {
    // HOIST into HEA_T collides at positions 1 (E→O) and 2 (A→I): both D2 and D3 are
    // malformed; each contributes its surviving letter, and none of A1's cells appear.
    const model = buildModel(heartSnapshot(['HEA.T', '.MB..', '.....', '.....', '.....']));
    expect(model.pencilPlanFor('A1', 'HOIST')).toEqual([
      { index: 6, letter: 'M' }, // D2's survivor
      { index: 7, letter: 'B' }, // D3's survivor
    ]);
  });

  test('REQ-ANS-019: nothing to soften — no conflicts, or survivors already penciled', () => {
    expect(buildModel(heartSnapshot()).pencilPlanFor('A1', 'HEART')).toEqual([]);
    // Existing letters agree with the word → no crossing is malformed.
    const agreeing = buildModel(heartSnapshot(['HEA.T', '..B..', '.....', '.....', '.....']));
    expect(agreeing.pencilPlanFor('A1', 'HEART')).toEqual([]);
    // The B survivor is already penciled — only the pen U needs the rewrite.
    const soft = buildModel(heartSnapshot(['HEA.T', '..b..', '..U..', '.....', '.....']));
    expect(soft.pencilPlanFor('A1', 'HEIST')).toEqual([{ index: 12, letter: 'U' }]);
  });
});
