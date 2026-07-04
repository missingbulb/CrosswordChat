import { describe, test, expect } from 'vitest';
import { toLetters, normalizedTokens, numberToWord, ordinalToWord } from '../../extension/src/matching/normalize.js';
import { homophonesOf } from '../../extension/src/matching/homophone-data.js';
import { evaluate, collectSpelledLetters, patternCompatible, collisionsWith } from '../../extension/src/matching/evaluate.js';
import { parseCommand } from '../../extension/src/matching/commands.js';

const P = (s) => s.split('').map((ch) => (ch === '.' ? null : ch)); // 'HEA.T' → pattern

describe('normalization', () => {
  test('REQ-ANS-001: answers normalize to uppercase A–Z only', () => {
    expect(toLetters("don't")).toBe('DONT');
    expect(toLetters('U.S.A.')).toBe('USA');
    expect(toLetters('  Hello, World! ')).toBe('HELLOWORLD');
    expect(toLetters('café')).toBe('CAF'); // non-A–Z letters dropped, documented MVP behavior
  });

  test('REQ-ANS-015: multi-word utterances join into one candidate', () => {
    expect(toLetters('a lot')).toBe('ALOT');
    expect(toLetters('ice cream')).toBe('ICECREAM');
  });

  test('REQ-ANS-002: digits and ordinals become words (year conventions)', () => {
    expect(numberToWord(8)).toBe('EIGHT');
    expect(numberToWord(42)).toBe('FORTYTWO');
    expect(numberToWord(305)).toBe('THREEHUNDREDFIVE');
    expect(numberToWord(1984)).toBe('NINETEENEIGHTYFOUR');
    expect(numberToWord(1900)).toBe('NINETEENHUNDRED');
    expect(numberToWord(1905)).toBe('NINETEENOHFIVE');
    expect(numberToWord(2001)).toBe('TWOTHOUSANDONE');
    expect(numberToWord(2024)).toBe('TWENTYTWENTYFOUR');
    expect(ordinalToWord(1)).toBe('FIRST');
    expect(ordinalToWord(22)).toBe('TWENTYSECOND');
    expect(normalizedTokens('8')).toEqual(['EIGHT']);
    expect(normalizedTokens('1st place')).toEqual(['FIRST', 'PLACE']);
    expect(toLetters('route 66')).toBe('ROUTESIXTYSIX');
  });
});

describe('homophones', () => {
  test('REQ-ANS-003: dictionary expands common homophone sets', () => {
    expect(homophonesOf('ATE')).toContain('EIGHT');
    expect(homophonesOf('EIGHT')).toContain('ATE');
    expect(homophonesOf('PLAIN')).toContain('PLANE');
    expect(homophonesOf('READ')).toEqual(expect.arrayContaining(['REED', 'RED'])); // overlapping sets union
    expect(homophonesOf('XYZZY')).toEqual([]);
  });
});

describe('evaluate', () => {
  test('REQ-ANS-005/REQ-ANS-006: exact-length literal fits', () => {
    const out = evaluate({ alternatives: [{ transcript: 'heart' }], entryLength: 5, pattern: P('.....') });
    expect(out).toEqual({ kind: 'fit', word: 'HEART', spelledDifferently: false });
  });

  test('REQ-ANS-002/REQ-ANS-003: "8" rescued as ATE for a 3-cell entry, spelled out', () => {
    const out = evaluate({ alternatives: [{ transcript: '8' }], entryLength: 3, pattern: P('...') });
    expect(out.kind).toBe('fit');
    expect(out.word).toBe('ATE');
    expect(out.spelledDifferently).toBe(true); // literal was EIGHT
  });

  test('REQ-ANS-005: length gate rejects all wrong lengths', () => {
    const out = evaluate({ alternatives: [{ transcript: 'ocelot' }], entryLength: 4, pattern: P('....') });
    expect(out.kind).toBe('length-mismatch');
    expect(out.needed).toBe(4);
    expect(out.variants[0]).toEqual({ word: 'OCELOT', len: 6 });
  });

  test('REQ-ANS-007: mismatch report includes homophone variants with their lengths', () => {
    const out = evaluate({ alternatives: [{ transcript: 'eight' }], entryLength: 4, pattern: P('....') });
    expect(out.kind).toBe('length-mismatch');
    const words = out.variants.map((v) => v.word);
    expect(words).toContain('EIGHT'); // 5
    expect(words).toContain('ATE'); // 3
    expect(out.variants.find((v) => v.word === 'EIGHT').len).toBe(5);
  });

  test('REQ-ANS-008: collision names 0-based position, wanted and existing letters', () => {
    const out = evaluate({ alternatives: [{ transcript: 'heist' }], entryLength: 5, pattern: P('HEA.T') });
    expect(out.kind).toBe('collision');
    expect(out.word).toBe('HEIST');
    expect(out.collisions).toEqual([{ pos: 2, want: 'I', have: 'A' }]);
  });

  test('REQ-ANS-009: several homophones fitting length AND pattern → ambiguous, never a guess', () => {
    const out = evaluate({ alternatives: [{ transcript: 'plain' }], entryLength: 5, pattern: P('.L...') });
    expect(out.kind).toBe('ambiguous');
    expect(out.words.sort()).toEqual(['PLAIN', 'PLANE']);
  });

  test('REQ-ANS-009: pattern disambiguates homophones when it can', () => {
    const out = evaluate({ alternatives: [{ transcript: 'plain' }], entryLength: 5, pattern: P('...N.') });
    expect(out).toEqual({ kind: 'fit', word: 'PLANE', spelledDifferently: true });
  });

  test('REQ-ANS-004: later STT alternatives are used when the top one fails', () => {
    const out = evaluate({
      alternatives: [{ transcript: 'playing' }, { transcript: 'plane' }],
      entryLength: 5,
      pattern: P('P..N.'),
    });
    expect(out.kind).toBe('fit');
    expect(out.word).toBe('PLANE');
    expect(out.spelledDifferently).toBe(true); // differs from top literal PLAYING
  });

  test('REQ-ANS-010: rejected words are excluded from candidates', () => {
    const out = evaluate({
      alternatives: [{ transcript: 'heart' }],
      entryLength: 5,
      pattern: P('.....'),
      rejected: ['HEART'],
    });
    expect(out.kind).toBe('unintelligible');
  });

  test('REQ-CMD-003: empty/garbled input is unintelligible', () => {
    expect(evaluate({ alternatives: [{ transcript: '...' }], entryLength: 5, pattern: P('.....') }).kind)
      .toBe('unintelligible');
  });

  test('pattern helpers behave', () => {
    expect(patternCompatible('HEART', P('H...T'))).toBe(true);
    expect(patternCompatible('HEART', P('X....'))).toBe(false);
    expect(collisionsWith('PLANE', P('.L.I.'))).toEqual([{ pos: 3, want: 'N', have: 'I' }]);
  });
});

describe('commands', () => {
  test('REQ-CMD-001: the normative lexicon table parses to the right intents', () => {
    const table = [
      ['next', 'next'], ['pass', 'next'], ['skip it', 'next'], ['move on', 'next'],
      ['repeat', 'repeat'], ['say that again', 'repeat'], ['what', 'repeat'],
      ['hint', 'hint'], ['what do i have', 'hint'], ["what's filled in", 'hint'], ['pattern', 'hint'],
      ['help', 'help'], ['what can i say', 'help'],
      ['stop', 'stop'], ['goodbye', 'stop'], ["we're done", 'stop'], ['quit', 'stop'],
      ['spell', 'spell'], ['let me spell it', 'spell'],
      ['enter it anyway', 'enter-anyway'], ['overwrite', 'enter-anyway'], ['force it', 'enter-anyway'],
      ['you misheard', 'misheard'], ["that's not what i said", 'misheard'],
      ['yes', 'yes'], ['yeah', 'yes'], ['no', 'no'], ['never mind', 'no'],
      ['first', 'choice'], ['the second one', 'choice'],
    ];
    for (const [utterance, command] of table) {
      expect(parseCommand(utterance)?.command, utterance).toBe(command);
    }
    expect(parseCommand('the first one')).toEqual({ command: 'choice', arg: 0 });
    expect(parseCommand('second')).toEqual({ command: 'choice', arg: 1 });
    expect(parseCommand('switch to most filled')).toEqual({ command: 'strategy', arg: 'most-filled' });
    expect(parseCommand('go in order')).toEqual({ command: 'strategy', arg: 'list-order' });
    expect(parseCommand('i meant plane')).toEqual({ command: 'misheard', arg: 'plane' });
    expect(parseCommand('no i said heart')).toEqual({ command: 'misheard', arg: 'heart' });
  });

  test('REQ-ANS-014: "answer ..." escape hatch forces literal answers', () => {
    expect(parseCommand('answer pass')).toEqual({ command: 'answer', arg: 'pass' });
    expect(parseCommand('the answer is heart')).toEqual({ command: 'answer', arg: 'heart' });
    expect(parseCommand('guess plane')).toEqual({ command: 'answer', arg: 'plane' });
    expect(parseCommand('try steel')).toEqual({ command: 'answer', arg: 'steel' });
  });

  test('non-commands return null (plain answers fall through)', () => {
    expect(parseCommand('heart')).toBeNull();
    expect(parseCommand('a lot')).toBeNull();
  });
});

describe('spelling collection', () => {
  test('REQ-ANS-011: bare letters, NATO, letter names, and "double u"', () => {
    expect(collectSpelledLetters('h e a r t').letters).toEqual(['H', 'E', 'A', 'R', 'T']);
    expect(collectSpelledLetters('hotel echo alpha romeo tango').letters).toEqual(['H', 'E', 'A', 'R', 'T']);
    expect(collectSpelledLetters('bee sea dee').letters).toEqual(['B', 'C', 'D']);
    expect(collectSpelledLetters('double u').letters).toEqual(['W']);
  });

  test('REQ-ANS-011: control words', () => {
    expect(collectSpelledLetters('undo').control).toBe('undo');
    expect(collectSpelledLetters('done').control).toBe('done');
    expect(collectSpelledLetters("that's it").control).toBe('done');
    expect(collectSpelledLetters('cancel').control).toBe('cancel');
    expect(collectSpelledLetters('never mind').control).toBe('cancel');
  });

  test('REQ-ANS-011: unknown tokens are counted, not guessed', () => {
    const out = collectSpelledLetters('banana x');
    expect(out.letters).toEqual(['X']);
    expect(out.ignored).toBe(1);
  });
});
