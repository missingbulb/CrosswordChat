import { describe, test, expect } from 'vitest';
import { buildModel } from '../../extension/src/puzzle-model/model.js';
import { nextClue } from '../../extension/src/conversation/strategies.js';
import { heartSnapshot } from '../helpers/snapshots.js';

describe('next-clue strategies', () => {
  test('REQ-NAV-002: list order advances after the current clue and wraps', () => {
    const model = buildModel(heartSnapshot());
    expect(nextClue(model, 'A1', 'list-order')).toEqual({ clueId: 'A6', wrapped: false });
    expect(nextClue(model, 'D5', 'list-order')).toEqual({ clueId: 'A1', wrapped: true });
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
    expect(pick.wrapped).toBe(false);
  });

  test('REQ-NAV-004: most-filled prefers others over the current clue and ties break by list order', () => {
    const model = buildModel(heartSnapshot());
    // All empty: ties everywhere → first in list order that isn't the current clue.
    expect(nextClue(model, 'A1', 'most-filled').clueId).toBe('A6');
  });
});
