import { describe, test, expect } from 'vitest';
import { buildModel } from '../../extension/src/puzzle-model/model.js';
import { nextClue } from '../../extension/src/conversation/strategies.js';
import { heartSnapshot, makeSnapshot } from '../helpers/snapshots.js';

// Across-only grid (block rows kill the downs): independent entries with
// controllable lengths/fills. A1 = 3 of 5 (2 open), A2 = 2 of 3 (1 open), A3 = 0 of 5.
const COUNT_ROWS = ['HEA..', '#####', 'AB.#.', '#####', '.....'];

// A block-separated band of three parallel across entries (A1, A2, A3) with NO downs,
// so nothing crosses anything: distance/forward ties can be tested free of the crossing
// tiebreak. All empty → every open count is equal.
const BAND_ROWS = ['.....', '#####', '.....', '#####', '.....'];

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

  test('REQ-NAV-004: most-filled picks the entry with the fewest open letters', () => {
    // All entries are 5 long here, so fewest-open tracks most-filled: A1 leads with 3
    // letters placed → only 2 blanks left, closer to done than anything else.
    const model = buildModel(heartSnapshot([
      'HEA..', // A1: 3/5 filled → 2 open
      'E....', // A6: 1/5 → 4 open
      '.....',
      '.....',
      '.....',
    ]));
    const pick = nextClue(model, 'A9', 'most-filled');
    expect(pick.clueId).toBe('A1'); // 2 open letters, fewer than everything else
  });

  test('REQ-NAV-004: with no crossings, equal open counts jump the least distance; forward wins a tie', () => {
    // Parallel band, all empty → open counts equal and nothing crosses, so DISTANCE alone
    // decides. From A2 both neighbours are one step away — forward (A3) wins the exact tie.
    const model = buildModel(makeSnapshot(BAND_ROWS));
    expect(nextClue(model, 'A2', 'most-filled').clueId).toBe('A3');
    // From A1, A2 is one step and A3 two — the nearer clue is offered, current excluded.
    expect(nextClue(model, 'A1', 'most-filled').clueId).toBe('A2');
  });

  test('REQ-NAV-004: among equally-close clues, one crossing the current entry beats a nearer non-crosser', () => {
    // Full 5×5, all empty → every open count ties, so the CROSSING tiebreak governs. Every
    // Across crosses every Down here. From D3 the list-order-adjacent clues are D2/D4 (one
    // step) — but they run parallel to D3 and never touch it, so an Across that crosses D3
    // is offered first; the nearest such crosser is A9. Distance alone would have said D4.
    const model = buildModel(heartSnapshot());
    expect(nextClue(model, 'D3', 'most-filled').clueId).toBe('A9');
    // Symmetric from an Across: A7/A9 sit one step from A8 but are parallel; the crossing
    // Downs win, nearest first → D1. (Before the crossing rule this returned A9.)
    expect(nextClue(model, 'A8', 'most-filled').clueId).toBe('D1');
  });

  test('REQ-NAV-004: closeness still dominates crossing — fewer gaps wins even without crossing', () => {
    // A7 is 4-of-5 (1 open) and runs parallel to the current clue A9 (never crosses it).
    // The Downs D1–D4 DO cross A9 but sit at 1-of-5 (4 open). Closest-to-done ranks first,
    // so the non-crossing A7 is still chosen over every crossing-but-emptier Down.
    const model = buildModel(heartSnapshot(['.....', '.....', 'ABUS.', '.....', '.....']));
    expect(nextClue(model, 'A9', 'most-filled').clueId).toBe('A7');
  });

  test('REQ-NAV-004: most-filled ranks by gaps remaining, not letters placed', () => {
    const model = buildModel(makeSnapshot(COUNT_ROWS));
    // A2 has 1 blank left (2 of 3); A1 has 2 blanks (3 of 5). Closest to done wins, even
    // though A1 holds MORE letters — the longer entry with more gaps is not offered first.
    expect(nextClue(model, 'A3', 'most-filled').clueId).toBe('A2');
  });

  test('REQ-NAV-004: penciled letters are half-open — shaky help leaves an entry more open', () => {
    // A1: 4 PENCILED + 1 blank → open = 1 + 0.5×4 = 3; A2: 3 pen + 2 blank → open = 2.
    // A2 is closer to done, so it wins — even though A1 shows more letters.
    const model = buildModel(makeSnapshot(['hear.', '#####', 'ABU..', '#####', '.....']));
    expect(nextClue(model, 'A3', 'most-filled').clueId).toBe('A2');
    // Flip A1's letters to pen: now A1 (open 1) beats A2 (open 2) — the same letters, but
    // confirmed, close the entry that shaky pencil could not.
    const pen = buildModel(makeSnapshot(['HEAR.', '#####', 'ABU..', '#####', '.....']));
    expect(nextClue(pen, 'A3', 'most-filled').clueId).toBe('A1');
  });

  test('REQ-NAV-011: recently skipped clues are passed over for the next-best pick', () => {
    const model = buildModel(makeSnapshot(COUNT_ROWS));
    // A2 (1 open) is the natural pick; skip it and "next" moves on to A1 (2 open).
    expect(nextClue(model, 'A3', 'most-filled', ['A2']).clueId).toBe('A1');
  });

  test('REQ-NAV-011: with every open clue skipped, the least recently skipped is revisited', () => {
    const model = buildModel(makeSnapshot(COUNT_ROWS));
    expect(nextClue(model, 'A3', 'most-filled', ['A2', 'A1']).clueId).toBe('A2');
    expect(nextClue(model, 'A3', 'most-filled', ['A1', 'A2']).clueId).toBe('A1');
  });
});
