import { describe, test, expect } from 'vitest';
import { verbalizeClue, render, ordinal, spellOut } from '../../extension/src/conversation/phrases.js';

const clue = (runs, extra = {}) => verbalizeClue({
  label: '1 Across',
  runs: typeof runs === 'string' ? [{ text: runs, italic: false }] : runs,
  ...extra,
});

describe('clue readout (READ)', () => {
  test('REQ-READ-001: just the clue text — neither the label nor a letter count is spoken', () => {
    expect(clue('Organ with four chambers'))
      .toBe('Organ with four chambers.'); // REQ-READ-008 retired: no "5 letters." tail
  });

  test('REQ-READ-002: italic word announced after the text', () => {
    const out = clue([{ text: 'Little ', italic: false }, { text: 'house', italic: true }]);
    expect(out).toContain('Little house.');
    expect(out).toContain("The word 'house' is in italics.");
  });

  test('REQ-READ-002: italic phrase and whole-clue italics variants', () => {
    const phrase = clue([{ text: 'Word before ', italic: false }, { text: 'little house', italic: true }]);
    expect(phrase).toContain("The phrase 'little house' is in italics.");
    const whole = clue([{ text: 'Little house', italic: true }]);
    expect(whole).toContain('The whole clue is in italics.');
  });

  test('REQ-READ-003: whole-clue brackets announced, bracket characters not read', () => {
    const out = clue('[Treat badly]');
    expect(out).toContain('The clue is in brackets: Treat badly.');
    expect(out).not.toContain('[');
  });

  test('REQ-READ-004/REQ-SPCH-006: question mark kept for TTS AND announced in words', () => {
    const out = clue('It might go viral?');
    expect(out).toContain('It might go viral?');
    expect(out).toContain('Question mark.');
  });

  test('REQ-READ-005: underscore runs are spoken as "blank"', () => {
    const out = clue('"The ___ of the Matter"');
    expect(out).toContain('The blank of the Matter');
    expect(out).not.toContain('_');
  });

  test('REQ-READ-006: only a fully quoted clue is announced; partial quotes stay silent', () => {
    expect(clue('"Hooray!"')).toContain('The clue is in quotes.');
    expect(clue('Word after "boo", often')).not.toContain('quotes');
  });

  test('REQ-READ-008 (retired): the readout never announces a letter count', () => {
    for (const text of ['Plain clue', 'It might go viral?', '[Sigh]']) {
      expect(clue(text)).not.toMatch(/\d+ letters/);
    }
  });

  test('REQ-READ-010: cross-references read literally', () => {
    expect(clue('See 17-Across')).toBe('See 17-Across.');
  });

  test('REQ-READ-011: editorial tags like ": Abbr." are preserved verbatim', () => {
    expect(clue("Violinist's supply: Abbr.")).toContain(': Abbr.');
  });

  test('REQ-LIFE-010: the greeting glues straight onto the clue text; no wrap prefix exists', () => {
    expect(clue('Plain clue', { greeting: true }).startsWith("Let's solve. Plain clue.")).toBe(true);
    expect(clue('Plain clue', { wrapped: true })).toBe('Plain clue.'); // REQ-NAV-006 retired
  });

  test('REQ-NAV-011: a revisited (skipped) clue is prefixed so it does not read as new', () => {
    expect(clue('Plain clue', { revisit: true })).toBe('Back to this one. Plain clue.');
    expect(clue('Plain clue')).toBe('Plain clue.'); // default: no prefix
  });
});

describe('outcome phrasing', () => {
  test('REQ-ANS-006: fit is a terse "Fits!"; only homophone rescues get spelled out', () => {
    expect(render({ kind: 'fit', word: 'HEART', spelledDifferently: false })).toBe('Fits!');
    const spelled = render({ kind: 'fit', word: 'ATE', spelledDifferently: true });
    expect(spelled).toContain('A, T, E');
    expect(spelled).toContain('fits');
    expect(spelled).not.toContain('letters'); // no letter count in either form
  });

  test('REQ-ANS-007: length mismatch states only the problem — variants, lengths, target', () => {
    const out = render({
      kind: 'length-mismatch',
      variants: [{ word: 'EIGHT', len: 5 }, { word: 'ATE', len: 3 }],
      needed: 4,
    });
    expect(out).toContain('Eight is 5 letters');
    expect(out).toContain('Ate is 3 letters');
    expect(out).toContain('we need 4');
    expect(out).not.toContain('I heard'); // no preamble before the problem
  });

  test('REQ-ANS-007: homophone respellings are reported by length only — never voiced', () => {
    // KNEWYORK spoken aloud is indistinguishable from NEWYORK, so naming both would give
    // the "same" word two lengths (issue #43's "Newyork is 7 letters, and Knewyork is 8").
    const out = render({
      kind: 'length-mismatch',
      variants: [{ word: 'NEWYORK', len: 7, swaps: 0 }, { word: 'KNEWYORK', len: 8, swaps: 1 }],
      needed: 4,
    });
    expect(out).toContain('Newyork is 7 letters');
    expect(out).toContain('or 8 spelled differently');
    expect(out).not.toContain('Knewyork');
    expect(out).toContain('we need 4');
  });

  test('REQ-ANS-007: when every variant is a respelling, the lengths are the whole report', () => {
    // The literal was rejected via "you misheard" — voicing KNEWYORK would repeat the
    // very sound the user just rejected, so no word is named at all.
    const out = render({
      kind: 'length-mismatch',
      variants: [{ word: 'KNEWYORK', len: 8, swaps: 1 }],
      needed: 5,
    });
    expect(out).toContain("That's 8 letters");
    expect(out).toContain('we need 5');
    expect(out).not.toContain('Knewyork');
  });

  test('REQ-SPCH-012: the reset-storm hint names background noise', () => {
    expect(render({ kind: 'noise-hint' })).toMatch(/background noise/i);
  });

  test('REQ-ANS-018: spelling a partially solved entry — both counts offered, prompt mentions the option', () => {
    const mismatch = render({
      kind: 'length-mismatch',
      variants: [{ word: 'EA', len: 2 }],
      needed: 5,
      open: 3,
    });
    expect(mismatch).toContain('we need 5');
    expect(mismatch).toContain('3 for just the open squares');

    expect(render({ kind: 'spell-start', open: 3, length: 5 })).toContain('just the 3 missing letters');
    // Nothing filled yet (or fully filled): the plain prompt, no partial option.
    expect(render({ kind: 'spell-start', open: 5, length: 5 })).not.toContain('missing');
    expect(render({ kind: 'spell-start', open: 0, length: 5 })).not.toContain('missing');
  });

  test('REQ-ANS-008: collision is quick — spot, grid letter, crossing; no preamble, no menu', () => {
    const out = render({
      kind: 'collision',
      word: 'HEIST',
      collisions: [{ pos: 2, want: 'I', have: 'A', crossLabel: '3 Down' }],
    });
    expect(out).toBe('Heist clashes — the third letter is already A, from 3 Down.');
  });

  test('REQ-ANS-008: multiple collisions — first in full, the rest only counted', () => {
    const out = render({
      kind: 'collision',
      word: 'PLANE',
      collisions: [
        { pos: 1, want: 'L', have: 'X', crossLabel: '2 Down' },
        { pos: 3, want: 'N', have: 'I', crossLabel: null },
        { pos: 4, want: 'E', have: 'O', crossLabel: '5 Down' },
      ],
    });
    expect(out).toBe('Plane clashes — the second letter is already X, from 2 Down, and 2 more clashes.');
  });

  test('REQ-ANS-009: disambiguation offers spellings', () => {
    const out = render({ kind: 'ambiguous', words: ['PLAIN', 'PLANE'] });
    expect(out).toContain('P, L, A, I, N');
    expect(out).toContain('P, L, A, N, E');
    expect(out).toContain('First or second?');
  });

  test('REQ-HINT-001/REQ-HINT-002: pattern hint with blanks and progress summary', () => {
    expect(render({ kind: 'hint', pattern: ['H', null, null, 'R', 'T'], filled: 3, length: 5 }))
      .toBe('H, blank, blank, R, T. 3 of 5 letters filled.');
    expect(render({ kind: 'hint', pattern: [null, null], filled: 0, length: 2 }))
      .toContain('Nothing filled in yet.');
  });

  test('REQ-ANS-016: an override is a terse "Override!"; only homophone rescues get spelled out', () => {
    expect(render({ kind: 'override', word: 'HEART', spelledDifferently: false })).toBe('Override!');
    const spelled = render({ kind: 'override', word: 'ATE', spelledDifferently: true });
    expect(spelled).toContain('A, T, E');
    expect(spelled).toContain('override');
    expect(spelled).not.toContain('letters'); // no letter count, no confirmation prompt
  });

  test('REQ-LIFE-004/REQ-LIFE-005: celebrations are celebratory', () => {
    expect(render({ kind: 'already-solved' }).toLowerCase()).toContain('hooray');
    expect(render({ kind: 'celebration' }).toLowerCase()).toContain('hooray');
  });

  test('REQ-LIFE-006: full-but-wrong avoids claiming victory', () => {
    const out = render({ kind: 'grid-full-wrong' }).toLowerCase();
    expect(out).toContain('full');
    expect(out).not.toContain('hooray');
  });

  test('helpers: ordinals and spelling', () => {
    expect(ordinal(1)).toBe('first');
    expect(ordinal(3)).toBe('third');
    expect(spellOut('ABC')).toBe('A, B, C');
  });
});
