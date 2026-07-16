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

  test('REQ-NAV-004: most-filled picks the entry with the most letters placed', () => {
    // A1 leads with 3 letters placed — more headway than anything else on the grid, so it
    // is offered first regardless of length.
    const model = buildModel(heartSnapshot([
      'HEA..', // A1: 3 placed
      'E....', // A6: 1 placed
      '.....',
      '.....',
      '.....',
    ]));
    const pick = nextClue(model, 'A9', 'most-filled');
    expect(pick.clueId).toBe('A1'); // 3 letters placed, more than everything else
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

  test('REQ-NAV-004: placed count still dominates crossing — the more-filled clue wins', () => {
    // Current clue D2 holds a letter (crossing rule live). D5 is 4-of-5 (4 placed) and runs
    // parallel to D2 (never crosses it); A9 is 2-of-5 (2 placed), DOES cross D2, and is nearer.
    // Most-placed ranks first, so the non-crossing, farther D5 still beats crossing A9.
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

  test('REQ-NAV-004: on a blank current entry, placed count still overrides the same-direction walk', () => {
    // The blank-current rule is only a TIE-break. Col 0 is 4-of-5 (D1 has 4 placed) while the
    // current clue A9 is blank. Most-placed still ranks first, so "next" goes to the more-filled
    // crossing Down D1 rather than the next Across — the sequential walk yields only on ties.
    const model = buildModel(heartSnapshot(['X....', 'X....', 'X....', 'X....', '.....']));
    expect(nextClue(model, 'A9', 'most-filled').clueId).toBe('D1');
  });

  test('REQ-NAV-004: most-filled ranks by letters placed, not gaps remaining', () => {
    const model = buildModel(makeSnapshot(COUNT_ROWS));
    // A1 holds 3 letters (3 of 5); A2 holds 2 (2 of 3). Most headway wins, even though A1 has
    // MORE gaps left — momentum on the more-filled entry beats the shorter, nearer-done one.
    expect(nextClue(model, 'A3', 'most-filled').clueId).toBe('A1');
  });

  test('REQ-NAV-004: penciled letters are half-placed — confirmed progress outweighs more pencil', () => {
    // A1: 2 CONFIRMED letters → placed = 2; A2: 3 pen → placed = 0.5×3 = 1.5. A1 has made more
    // (confirmed) headway, so it wins — even though A2 shows more letters on the grid.
    const model = buildModel(makeSnapshot(['HE...', '#####', 'abc..', '#####', '.....']));
    expect(nextClue(model, 'A3', 'most-filled').clueId).toBe('A1');
    // Flip A1's letters to pen: now A1 (placed 1) yields to A2 (placed 1.5) — shaky pencil is
    // worth only half, so three penciled letters edge out two penciled ones.
    const pen = buildModel(makeSnapshot(['he...', '#####', 'abc..', '#####', '.....']));
    expect(nextClue(pen, 'A3', 'most-filled').clueId).toBe('A2');
  });

  test('REQ-NAV-011: recently skipped clues are passed over for the next-best pick', () => {
    const model = buildModel(makeSnapshot(COUNT_ROWS));
    // A1 (3 placed) is the natural pick; skip it and "next" moves on to A2 (2 placed).
    expect(nextClue(model, 'A3', 'most-filled', ['A1']).clueId).toBe('A2');
  });

  test('REQ-NAV-011: with every open clue skipped, the least recently skipped is revisited', () => {
    const model = buildModel(makeSnapshot(COUNT_ROWS));
    expect(nextClue(model, 'A3', 'most-filled', ['A2', 'A1']).clueId).toBe('A2');
    expect(nextClue(model, 'A3', 'most-filled', ['A1', 'A2']).clueId).toBe('A1');
  });

  test('REQ-NAV-004 / REQ-NAV-011: blank current + every started entry skipped → numerically-next blank, not a crossing one', () => {
    // Row 0 'HE...' makes A1, D1, D2 the only STARTED (non-empty) entries; the solver has
    // skipped all three. Standing on the blank A7, "next" has only equally-placed (blank) entries
    // left (the skips filter the started ones out), so it walks to the numerically-next Across
    // — A8 — and NOT to a Down crossing A7 (e.g. D3). The blank-current rule already forbids a
    // crossing jump, and the skip filter removes the started entries, so this holds on two counts.
    const model = buildModel(heartSnapshot(['HE...', '.....', '.....', '.....', '.....']));
    expect(nextClue(model, 'A7', 'most-filled', ['A1', 'D1', 'D2']).clueId).toBe('A8');
    // Contrast: without the skips, placed count offers a started entry first (A1 holds 2 letters).
    expect(nextClue(model, 'A7', 'most-filled', []).clueId).not.toBe('A8');
  });
});
