import { describe, test, expect } from 'vitest';
import { buildModel } from '../../extension/src/puzzle-model/model.js';
import { nextClue } from '../../extension/src/conversation/strategies.js';
import { heartSnapshot, makeSnapshot } from '../helpers/snapshots.js';

// Across-only grid (block rows kill the downs): independent entries with
// controllable lengths/fills. A1 = 3/5 (60%), A2 = 2/3 (67%), A3 = 0/5.
const RATIO_ROWS = ['HEA..', '#####', 'AB.#.', '#####', '.....'];

describe('next-clue strategies', () => {
  test('REQ-NAV-002: list order advances after the current clue and wraps', () => {
    const model = buildModel(heartSnapshot());
    expect(nextClue(model, 'A1', 'list-order')).toEqual({ clueId: 'A6' });
    expect(nextClue(model, 'D5', 'list-order')).toEqual({ clueId: 'A1' });
  });

  test('REQ-NAV-003: fully filled entries are skipped when advancing', () => {
    // Row 2 (A6) and row 3 (A7) filled → from A1, next unfilled across is A8.
    const model = buildModel(heartSnapshot(['.....', 'EMBER', 'ABUSE', '.....', '.....']));
    expect(nextClue(model, 'A1', 'list-order').clueId).toBe('A8');
  });

  test('REQ-NAV-003 / REQ-LIFE-006: nothing unfilled → null (caller announces)', () => {
    const model = buildModel(heartSnapshot(['HEART', 'EMBER', 'ABUSE', 'RESIN', 'TREND']));
    expect(nextClue(model, 'A1', 'list-order')).toBeNull();
  });

  test('REQ-NAV-004: most-filled picks the entry with the most letters already placed', () => {
    // Column letters: D2 gets 2 letters (E,M), D4 gets 1 (R), others vary; craft explicitly:
    // Row0 'H....' + Row1 'HE...' → D1 has H,H (2 filled), A6 has H,E (2)… keep it simple:
    const model = buildModel(heartSnapshot([
      'HEA..', // A1: 3/5 filled
      'E....', // A6: 1/5
      '.....',
      '.....',
      '.....',
    ]));
    const pick = nextClue(model, 'A9', 'most-filled');
    expect(pick.clueId).toBe('A1'); // 3 letters beats everything else
  });

  test('REQ-NAV-004: most-filled prefers others over the current clue; ties go nearest', () => {
    const model = buildModel(heartSnapshot());
    // All empty: ties everywhere → the closest clue in list order (here also the next one).
    expect(nextClue(model, 'A1', 'most-filled').clueId).toBe('A6');
  });

  test('REQ-NAV-004: equal ratios jump the least distance; forward wins an exact tie', () => {
    const model = buildModel(heartSnapshot());
    // All ratios equal. From A8: A7 and A9 are both one step away — forward wins.
    expect(nextClue(model, 'A8', 'most-filled').clueId).toBe('A9');
    // From D2 the nearest open clues are D1/D3 (one step) — never a far jump to A1.
    expect(nextClue(model, 'D2', 'most-filled').clueId).toBe('D3');
  });

  test('REQ-NAV-004: most-filled ranks by fill percentage, not raw letter count', () => {
    const model = buildModel(makeSnapshot(RATIO_ROWS));
    // A2 at 2/3 (67%) beats A1 at 3/5 (60%) even though A1 has more letters placed.
    expect(nextClue(model, 'A3', 'most-filled').clueId).toBe('A2');
  });

  test('REQ-NAV-011: recently skipped clues are passed over for the next-best ratio', () => {
    const model = buildModel(makeSnapshot(RATIO_ROWS));
    expect(nextClue(model, 'A3', 'most-filled', ['A2']).clueId).toBe('A1');
  });

  test('REQ-NAV-011: with every open clue skipped, the least recently skipped is revisited', () => {
    const model = buildModel(makeSnapshot(RATIO_ROWS));
    expect(nextClue(model, 'A3', 'most-filled', ['A2', 'A1']).clueId).toBe('A2');
    expect(nextClue(model, 'A3', 'most-filled', ['A1', 'A2']).clueId).toBe('A1');
  });
});
