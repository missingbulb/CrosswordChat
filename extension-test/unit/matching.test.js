import { describe, test, expect } from 'vitest';
import { toLetters, normalizedTokens, numberToWord, ordinalToWord } from '../../extension/src/matching/normalize.js';
import { homophonesOf } from '../../extension/src/matching/homophone-data.js';
import { evaluate, collectSpelledLetters, patternCompatible, collisionsWith } from '../../extension/src/matching/evaluate.js';
import { parseCommand, fuzzyCommand, bareClueNumber } from '../../extension/src/matching/commands.js';

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

  test('REQ-ANS-020: an all-letters utterance is a candidate without spelling mode', () => {
    // Letter names, one utterance, normal pipeline — spelled back since it differs from the literal.
    expect(evaluate({ alternatives: [{ transcript: 'aitch e a are tea' }], entryLength: 5, pattern: P('.....') }))
      .toEqual({ kind: 'fit', word: 'HEART', spelledDifferently: true });
    // NATO works too, and the pattern gate still applies.
    expect(evaluate({ alternatives: [{ transcript: 'hotel echo alpha romeo tango' }], entryLength: 5, pattern: P('H...T') }))
      .toEqual({ kind: 'fit', word: 'HEART', spelledDifferently: true });
    // Bare letters already collapse to the literal join — same word, plain fit.
    expect(evaluate({ alternatives: [{ transcript: 'h e a r t' }], entryLength: 5, pattern: P('.....') }))
      .toEqual({ kind: 'fit', word: 'HEART', spelledDifferently: false });
  });

  test('REQ-ANS-020: the spelled reading requires every token to be a letter', () => {
    // 'INDIA' alone is the word INDIA (a plausible answer), not the letter I.
    expect(evaluate({ alternatives: [{ transcript: 'india' }], entryLength: 5, pattern: P('.....') }))
      .toEqual({ kind: 'fit', word: 'INDIA', spelledDifferently: false });
    // One non-letter token spoils the letter reading: no C-HORSE from "sea horse".
    const out = evaluate({ alternatives: [{ transcript: 'sea horse' }], entryLength: 6, pattern: P('......') });
    expect(out.kind).toBe('length-mismatch'); // SEAHORSE (8) reported, CHORSE never generated
    expect(out.variants.map((v) => v.word)).not.toContain('CHORSE');
  });

  test('REQ-ANS-021: a bare letter among words reads as its spoken name ("d claw" → DECLAW)', () => {
    expect(evaluate({ alternatives: [{ transcript: 'd claw' }], entryLength: 6, pattern: P('......') }))
      .toEqual({ kind: 'fit', word: 'DECLAW', spelledDifferently: true });
    expect(evaluate({ alternatives: [{ transcript: 'b hold' }], entryLength: 6, pattern: P('......') }))
      .toEqual({ kind: 'fit', word: 'BEHOLD', spelledDifferently: true });
    expect(evaluate({ alternatives: [{ transcript: 'x it' }], entryLength: 4, pattern: P('....') }))
      .toEqual({ kind: 'fit', word: 'EXIT', spelledDifferently: true });
    // The literal join stays preferred when IT fits: "d claw" on 5 cells is DCLAW.
    expect(evaluate({ alternatives: [{ transcript: 'd claw' }], entryLength: 5, pattern: P('.....') }))
      .toEqual({ kind: 'fit', word: 'DCLAW', spelledDifferently: false });
    // A letter ALONE is never a word — "d" does not become DE or DEE.
    expect(evaluate({ alternatives: [{ transcript: 'd' }], entryLength: 3, pattern: P('...') }).kind)
      .toBe('length-mismatch');
  });

  test('REQ-ANS-022: "say it, then spell it" reads as the word, not a doubled-up join', () => {
    // Bare letters: DOGDOG (the join) exists, but DOG also runs — and fits.
    expect(evaluate({ alternatives: [{ transcript: 'dog d o g' }], entryLength: 3, pattern: P('...') }))
      .toEqual({ kind: 'fit', word: 'DOG', spelledDifferently: true });
    // Letter names and NATO spell too.
    expect(evaluate({ alternatives: [{ transcript: 'dog dee oh gee' }], entryLength: 3, pattern: P('...') }))
      .toEqual({ kind: 'fit', word: 'DOG', spelledDifferently: true });
    expect(evaluate({ alternatives: [{ transcript: 'exit echo xray india tango' }], entryLength: 4, pattern: P('....') }))
      .toEqual({ kind: 'fit', word: 'EXIT', spelledDifferently: true });
    // Multi-word answers join before the comparison (REQ-ANS-015).
    expect(evaluate({ alternatives: [{ transcript: 'a lot a l o t' }], entryLength: 4, pattern: P('....') }))
      .toEqual({ kind: 'fit', word: 'ALOT', spelledDifferently: true });
  });

  test('REQ-ANS-022: a mismatch report leads with the said word, and the join stays reachable', () => {
    // Neither reading fits a 5-entry — but the complaint names DOG, not DOGDOG.
    const miss = evaluate({ alternatives: [{ transcript: 'dog d o g' }], entryLength: 5, pattern: P('.....') });
    expect(miss.kind).toBe('length-mismatch');
    expect(miss.variants[0]).toEqual({ word: 'DOG', len: 3 });
    // Trailing letters that spell something ELSE are not the pattern — no DOG candidate.
    const other = evaluate({ alternatives: [{ transcript: 'dog c a t' }], entryLength: 3, pattern: P('...') });
    expect(other.kind).toBe('length-mismatch');
    expect(other.variants[0].word).toBe('DOGCAT');
    // A genuinely doubled utterance ("dog dog") is still the join, never collapsed.
    expect(evaluate({ alternatives: [{ transcript: 'dog dog' }], entryLength: 6, pattern: P('......') }))
      .toEqual({ kind: 'fit', word: 'DOGDOG', spelledDifferently: false });
  });

  test('REQ-ANS-018: letters matching the open-square count fill just those — no mode', () => {
    // H E _ R _ (2 open): two spoken letters land in the holes; read back whole.
    expect(evaluate({ alternatives: [{ transcript: 'alpha tango' }], entryLength: 5, pattern: P('HE.R.') }))
      .toEqual({ kind: 'fit', word: 'HEART', spelledDifferently: true });
    // One hole, one letter.
    expect(evaluate({ alternatives: [{ transcript: 't' }], entryLength: 5, pattern: P('HEAR.') }))
      .toEqual({ kind: 'fit', word: 'HEART', spelledDifferently: true });
    // Empty entry: no open-square reading (that's plain spelling, REQ-ANS-020).
    expect(evaluate({ alternatives: [{ transcript: 'alpha tango' }], entryLength: 5, pattern: P('.....') }).kind)
      .toBe('length-mismatch');
  });

  test('REQ-ANS-020: length gate picks between the literal and the spelled reading', () => {
    // "are you" on a 2-cell entry: AREYOU (6) fails, spelled R-U fits.
    expect(evaluate({ alternatives: [{ transcript: 'are you' }], entryLength: 2, pattern: P('..') }))
      .toEqual({ kind: 'fit', word: 'RU', spelledDifferently: true });
    // Same utterance on a 6-cell entry: the literal word wins (pattern rules out
    // the EWE/YEW homophones so exactly one spelling remains).
    expect(evaluate({ alternatives: [{ transcript: 'are you' }], entryLength: 6, pattern: P('....O.') }))
      .toEqual({ kind: 'fit', word: 'AREYOU', spelledDifferently: false });
  });

  test('REQ-ANS-026: a reading more than 4 letters too long is not a wrong-length answer', () => {
    // A whole sentence caught by the mic overshoots the 5-cell entry by far — flagged
    // too-long, never the frustrating "... is 40 letters, we need 5".
    const long = evaluate({
      alternatives: [{ transcript: 'i think the answer might just possibly be love' }],
      entryLength: 5,
      pattern: P('.....'),
    });
    expect(long.kind).toBe('too-long');
    expect(long.needed).toBe(5);
    // Right at the boundary stays an ordinary length-mismatch: 4 over is still reported.
    const nine = evaluate({ alternatives: [{ transcript: 'wednesday' }], entryLength: 5, pattern: P('.....') });
    expect(nine.kind).toBe('length-mismatch'); // WEDNESDAY is 9 = 5 + 4
    // 5 over crosses the line.
    const ten = evaluate({ alternatives: [{ transcript: 'incredible' }], entryLength: 5, pattern: P('.....') });
    expect(ten.kind).toBe('too-long'); // INCREDIBLE is 10 = 5 + 5
  });

  test('REQ-ANS-026: a nearer over-length reading keeps the plain length report', () => {
    // OCELOT (6) for a 4-entry is only 2 over — still a normal, useful length report.
    expect(evaluate({ alternatives: [{ transcript: 'ocelot' }], entryLength: 4, pattern: P('....') }).kind)
      .toBe('length-mismatch');
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
      ['back', 'back'], ['go back', 'back'], ['previous clue', 'back'],
      ['flip', 'flip'], ['flip it', 'flip'], ['switch direction', 'flip'],
      ['undo', 'undo'], ['undue', 'undo'], ['take it back', 'undo'], // REQ-ANS-017
      ['clear', 'clear'], ['delete', 'clear'], ['erase it', 'clear'], // REQ-ANS-024
      ['pencil', 'pencil'], ['pencil mode', 'pencil'], ['use pencil', 'pencil'], // REQ-ANS-025
      ['pen', 'pen'], ['switch to pen', 'pen'], ['ink', 'pen'],

      ['repeat', 'repeat'], ['say that again', 'repeat'], ['what', 'repeat'],
      ['hint', 'hint'], ['what do i have', 'hint'], ["what's filled in", 'hint'], ['pattern', 'hint'],
      ['letters', 'hint'], ['spell it', 'hint'], // "spell it" reads the letters TO the user
      ['help', 'help'], ['what can i say', 'help'],
      ['stop', 'stop'], ['goodbye', 'stop'], ["we're done", 'stop'], ['quit', 'stop'],
      ['spell', 'spell'], ['let me spell it', 'spell'],
      ['enter it anyway', 'enter-anyway'], ['overwrite', 'enter-anyway'], ['force it', 'enter-anyway'],
      ['anyway', 'enter-anyway'], ['anyways', 'enter-anyway'], ['say it anyway', 'enter-anyway'],
      ['do it anyway', 'enter-anyway'], ['it anyway', 'enter-anyway'],
      ['you misheard', 'misheard'], ["that's not what i said", 'misheard'],
      ['yes', 'yes'], ['yeah', 'yes'], ['no', 'no'], ['never mind', 'no'],
      ['first', 'choice'], ['the second one', 'choice'],
    ];
    for (const [utterance, command] of table) {
      expect(parseCommand(utterance)?.command, utterance).toBe(command);
    }
    expect(parseCommand('the first one')).toEqual({ command: 'choice', arg: 0 });
    expect(parseCommand('second')).toEqual({ command: 'choice', arg: 1 });
    expect(parseCommand('i meant plane')).toEqual({ command: 'misheard', arg: 'plane' });
    expect(parseCommand('no i said heart')).toEqual({ command: 'misheard', arg: 'heart' });
  });

  test('REQ-NAV-013: a spoken clue label parses to a goto command', () => {
    expect(parseCommand('seven across')).toEqual({ command: 'goto', arg: { number: 7, direction: 'across' } });
    expect(parseCommand('go to 22 down')).toEqual({ command: 'goto', arg: { number: 22, direction: 'down' } });
    expect(parseCommand('twenty two across')).toEqual({ command: 'goto', arg: { number: 22, direction: 'across' } });
    expect(parseCommand('one hundred and five down')).toEqual({ command: 'goto', arg: { number: 105, direction: 'down' } });
    // No number → not a goto; the utterance stays available to the answer pipeline.
    expect(parseCommand('falling down')).toBeNull();
  });

  test('REQ-NAV-013: STT renderings of "across" — "a cross" / "cross" — still navigate', () => {
    // Live report: "5 across" never matched while "5 down" always did — the STT
    // splits "across" into "a cross" (or clips it to "cross").
    expect(parseCommand('5 a cross')).toEqual({ command: 'goto', arg: { number: 5, direction: 'across' } });
    expect(parseCommand('five cross')).toEqual({ command: 'goto', arg: { number: 5, direction: 'across' } });
    expect(parseCommand('go to 12 a cross')).toEqual({ command: 'goto', arg: { number: 12, direction: 'across' } });
    // A clear "across" with a garbled number is still navigation — the machine asks
    // for the number instead of treating SIXACROSS as a word.
    expect(parseCommand('gibberish across')).toEqual({ command: 'goto', arg: { number: null, direction: 'across' } });
    // Bare "... cross" with no number stays an answer candidate (RED CROSS is a word).
    expect(parseCommand('red cross')).toBeNull();
    expect(parseCommand('holy cross')).toBeNull();
  });

  test('REQ-NAV-013: a bare number parses for the goto-number recovery; non-numbers stay null', () => {
    // After "<garbled> across", the machine asks for the number alone — a lone number
    // (digit, word, or homophone) completes the jump; anything else escapes the sub-mode.
    expect(bareClueNumber('nine')).toBe(9);
    expect(bareClueNumber('9')).toBe(9);
    expect(bareClueNumber('twenty two')).toBe(22);
    expect(bareClueNumber('ninth')).toBe(9); // ordinal rendering
    expect(bareClueNumber('stop')).toBeNull(); // a real command escapes, not a number
    expect(bareClueNumber('heart')).toBeNull(); // an answer word is not a number
    expect(bareClueNumber('')).toBeNull();
  });

  test('REQ-NAV-013: "go to" is an explicit navigation prefix, even with a shaky tail', () => {
    // The prefix forces a label parse: number + direction come straight through.
    expect(parseCommand('go to seven across')).toEqual({ command: 'goto', arg: { number: 7, direction: 'across' } });
    expect(parseCommand('goto 22 down')).toEqual({ command: 'goto', arg: { number: 22, direction: 'down' } });
    // A garbled number under the prefix still navigates — direction kept, number asked for.
    expect(parseCommand('go to gibberish across')).toEqual({ command: 'goto', arg: { number: null, direction: 'across' } });
    // A number with no direction is still a goto (the machine asks which way), NOT an answer.
    expect(parseCommand('go to seven')).toEqual({ command: 'goto', arg: { number: 7, direction: null } });
    // STT homophones of "go to" and of "across" both hold.
    expect(parseCommand('go 2 five a cross')).toEqual({ command: 'goto', arg: { number: 5, direction: 'across' } });
    // Without the prefix, an ordinary "... down"/"... cross" answer still falls through.
    expect(parseCommand('falling down')).toBeNull();
    expect(parseCommand('red cross')).toBeNull();
  });

  test('REQ-ANS-026: fuzzyCommand plucks a lone command word out of a longer phrase', () => {
    expect(fuzzyCommand('uh lets just go with the next one')).toEqual({ command: 'next' });
    expect(fuzzyCommand('can you please repeat that for me')).toEqual({ command: 'repeat' });
    expect(fuzzyCommand('okay give me a hint here')).toEqual({ command: 'hint' });
    // Two DIFFERENT command words → refuse to guess.
    expect(fuzzyCommand('next or maybe back i cant decide')).toBeNull();
    // No command word at all → null (stays a didnt-catch).
    expect(fuzzyCommand('the quick brown fox')).toBeNull();
    expect(fuzzyCommand('')).toBeNull();
  });

  test('REQ-CMD-001: "spell" followed by letters carries them as the argument', () => {
    expect(parseCommand('spell a b c')).toEqual({ command: 'spell', arg: ['A', 'B', 'C'] });
    expect(parseCommand('spell bee sea dee')).toEqual({ command: 'spell', arg: ['B', 'C', 'D'] });
    expect(parseCommand('spelling hotel echo')).toEqual({ command: 'spell', arg: ['H', 'E'] });
    expect(parseCommand('spell it')).toEqual({ command: 'hint' }); // reads letters TO the user
    expect(parseCommand('spell trouble')).toBeNull(); // not letters — stays an ordinary utterance
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
