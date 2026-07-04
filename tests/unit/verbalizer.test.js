import { describe, test, expect } from 'vitest';
import { verbalizeClue, render, ordinal, spellOut } from '../../extension/src/conversation/phrases.js';

const clue = (runs, extra = {}) => verbalizeClue({
  label: '1 Across',
  runs: typeof runs === 'string' ? [{ text: runs, italic: false }] : runs,
  answerLength: 5,
  ...extra,
});

describe('clue readout (READ)', () => {
  test('REQ-READ-001: text then letter count — the clue label is never spoken', () => {
    expect(clue('Organ with four chambers'))
      .toBe('Organ with four chambers. 5 letters.');
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

  test('REQ-READ-006: quoted clues announced (whole vs partial)', () => {
    expect(clue('"Hooray!"')).toContain('The clue is in quotes.');
    expect(clue('Word after "boo", often')).toContain('Part of the clue is in quotes.');
  });

  test('REQ-READ-008: letter count is always the final sentence', () => {
    for (const text of ['Plain clue', 'It might go viral?', '[Sigh]']) {
      expect(clue(text).endsWith('5 letters.')).toBe(true);
    }
  });

  test('REQ-READ-010: cross-references read literally', () => {
    expect(clue('See 17-Across')).toBe('See 17-Across. 5 letters.');
  });

  test('REQ-READ-011: editorial tags like ": Abbr." are preserved verbatim', () => {
    expect(clue("Violinist's supply: Abbr.")).toContain(': Abbr.');
  });

  test('REQ-LIFE-010/REQ-NAV-006: greeting and wrap prefixes glue straight onto the clue text', () => {
    expect(clue('Plain clue', { greeting: true }).startsWith("Let's solve. Plain clue.")).toBe(true);
    expect(clue('Plain clue', { wrapped: true }).startsWith('Back to the top. Plain clue.')).toBe(true);
  });
});

describe('outcome phrasing', () => {
  test('REQ-ANS-006: fit announcement; homophone rescues get spelled out', () => {
    expect(render({ kind: 'fit', word: 'HEART', spelledDifferently: false }))
      .toBe('Heart. 5 letters — it fits!');
    const spelled = render({ kind: 'fit', word: 'ATE', spelledDifferently: true });
    expect(spelled).toContain('A, T, E');
    expect(spelled).toContain('it fits');
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

  test('REQ-ANS-008: collision states only the problem — spot, both letters, crossing', () => {
    const out = render({
      kind: 'collision',
      word: 'HEIST',
      collisions: [{ pos: 2, want: 'I', have: 'A', crossLabel: '3 Down' }],
    });
    expect(out).toContain("Heist doesn't work");
    expect(out).not.toContain('fits the length'); // no what-fits preamble
    expect(out).toContain('the third letter would be I');
    expect(out).toContain('already has A there from 3 Down');
    expect(out).toContain('say anyway'); // REQ-ANS-012: the offered override phrase matches the lexicon
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

  test('REQ-ANS-016: replace confirmation names both words', () => {
    const out = render({ kind: 'replace-confirm', word: 'HEART', current: 'WRONG' });
    expect(out).toContain('already reads Wrong');
    expect(out).toContain('Replace it with Heart?');
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
