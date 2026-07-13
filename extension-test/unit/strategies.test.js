import { describe, test, expect } from 'vitest';
import { buildModel } from '../../extension/src/puzzle-model/model.js';
import { nextClue } from '../../extension/src/conversation/strategies.js';
import { heartSnapshot, makeSnapshot } from '../helpers/snapshots.js';

// Across-only grid (block rows kill the downs): independent entries with
// controllable lengths/fills. A1 = 3 of 5 (2 open), A2 = 2 of 3 (1 open), A3 = 0 of 5.
const COUNT_ROWS = ['HEA..', '#####', 'AB.#.', '#####', '.....'];

// A block-separated band of parallel across entries (A1, A2, A3, A4) with NO downs, so
// nothing crosses anything: the distance/forward tiebreak can be tested free of crossing.
// A2 carries a letter so the CURRENT clue is non-blank — otherwise the blank-current edge
// case (sequential same-direction) would take over. A1/A3/A4 are open and equal.
const BAND_ROWS = ['.....', '#####', 'X....', '#####', '.....', '#####', '.....'];

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

  test('REQ-NAV-004: with no crossings, ties jump the least distance; forward wins an exact tie', () => {
    // Parallel band, no downs → nothing crosses, and the current clue A2 holds a letter so
    // the blank-current rule is out of the way: DISTANCE alone decides. A1 and A3 are both
    // one step from A2 (A4 is two) — the nearer pair wins, and forward breaks their tie → A3.
    const model = buildModel(makeSnapshot(BAND_ROWS));
    expect(nextClue(model, 'A2', 'most-filled').clueId).toBe('A3');
  });

  test('REQ-NAV-004: with the current entry started, a crossing clue beats a nearer non-crosser', () => {
    // A6 (the current clue) holds one letter, so the crossing tiebreak is live. A8 (4-of-5,
    // 1 open) and D1 (4-of-5, 1 open) tie for closest-to-done. A8 is nearer to A6 in list
    // order but runs parallel to it; D1 crosses A6, so D1 is offered. Distance alone → A8.
    const model = buildModel(heartSnapshot(['A....', 'B....', 'C....', 'WXYZ.', '.....']));
    expect(nextClue(model, 'A6', 'most-filled').clueId).toBe('D1');
  });

  test('REQ-NAV-004: closeness still dominates crossing — the closer-to-done clue wins', () => {
    // Current clue D2 holds a letter (crossing rule live). D5 is 4-of-5 (1 open) and runs
    // parallel to D2 (never crosses it); A9 is 2-of-5 (3 open), DOES cross D2, and is nearer.
    // Fewest-open ranks first, so the non-crossing, farther D5 still beats crossing A9.
    const model = buildModel(heartSnapshot(['....P', '....Q', '....R', '....S', 'TU...']));
    expect(nextClue(model, 'D2', 'most-filled').clueId).toBe('D5');
  });

  test('REQ-NAV-004: blank current entry → next in the SAME direction by number, wrapping, never crossing', () => {
    // All empty → every open count ties, so the tiebreak alone decides. From a blank entry
    // "next" walks the same direction numerically (REQ-NAV-004 edge) instead of jumping to a
    // crossing perpendicular clue: an Across goes to the next Across, a Down to the next Down.
    const model = buildModel(heartSnapshot());
    expect(nextClue(model, 'A1', 'most-filled').clueId).toBe('A6'); // next Across
    expect(nextClue(model, 'A9', 'most-filled').clueId).toBe('A1'); // wraps, stays Across
    expect(nextClue(model, 'D3', 'most-filled').clueId).toBe('D4'); // next Down, not a crossing Across
    expect(nextClue(model, 'D5', 'most-filled').clueId).toBe('D1'); // wraps, stays Down
  });

  test('REQ-NAV-004: on a blank current entry, closeness still overrides the same-direction walk', () => {
    // The blank-current rule is only a TIE-break. Col 0 is 4-of-5 (D1 has 1 open) while the
    // current clue A9 is blank. Fewest-open still ranks first, so "next" goes to the near-done
    // crossing Down D1 rather than the next Across — the sequential walk yields only on ties.
    const model = buildModel(heartSnapshot(['X....', 'X....', 'X....', 'X....', '.....']));
    expect(nextClue(model, 'A9', 'most-filled').clueId).toBe('D1');
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
