// Command lexicon (REQ-CMD-001). Matched on the whole normalized utterance;
// answers get an escape hatch via "answer ..." (REQ-ANS-014).

import { normalizeUtterance, numberToWord, ordinalToWord } from './normalize.js';
import { collectSpelledLetters } from './evaluate.js';

// Spoken clue numbers ("seven", "twenty two") → integers, for goto (REQ-NAV-013).
// STT garbles small numbers a lot (live report: 6/7/9 repeatedly missed), so the map
// also carries ordinals ("sixth" — a common rendering of a number before a noun) and
// the frequent homophones.
const NUMBER_WORDS = new Map();
for (let n = 1; n <= 150; n++) NUMBER_WORDS.set(numberToWord(n).toLowerCase(), n);
for (let n = 1; n <= 99; n++) NUMBER_WORDS.set(ordinalToWord(n).toLowerCase(), n);
for (const [word, n] of Object.entries({
  won: 1, to: 2, too: 2, tree: 3, free: 3, for: 4, fore: 4,
  sex: 6, sick: 6, sicks: 6, six: 6, heaven: 7, ate: 8, nein: 9, nun: 9,
})) NUMBER_WORDS.set(word, n);

function parseClueNumber(text) {
  if (/^\d+$/.test(text)) return Number(text);
  const ordinal = text.match(/^(\d+)(st|nd|rd|th)$/); // "6th across"
  if (ordinal) return Number(ordinal[1]);
  const joined = text.split(' ').filter((t) => t !== 'and').join('');
  return NUMBER_WORDS.get(joined) ?? null;
}

const PHRASES = {
  next: ['next', 'next clue', 'next one', 'pass', 'pass on this', 'skip', 'skip it',
    'skip this one', 'move on'],
  back: ['back', 'go back', 'previous', 'previous clue', 'previous one'],
  flip: ['flip', 'flip it', 'switch direction', 'change direction', 'other direction'],
  // "undue" is what STT usually makes of "undo" (REQ-ANS-017).
  undo: ['undo', 'undue', 'undo that', 'undo it', 'take that back', 'take it back'],
  // Empty the current entry (REQ-ANS-024). Undoable, so the bare words are safe.
  clear: ['clear', 'clear it', 'clear that', 'clear the word', 'clear this word',
    'delete', 'delete it', 'delete that', 'delete the word', 'erase', 'erase it'],
  // Write-mode switch (REQ-ANS-025): answers land penciled until "pen".
  pencil: ['pencil', 'pencil mode', 'switch to pencil', 'use pencil', 'in pencil', 'pencil in'],
  pen: ['pen', 'pen mode', 'switch to pen', 'use pen', 'in pen', 'ink'],
  repeat: ['repeat', 'repeat that', 'again', 'say again', 'say that again', 'read it again',
    'what', 'come again'],
  // "spell it" reads the letters TO the user; spelling mode is entered with "spell" etc.
  hint: ['hint', 'hints', 'give me a hint', 'what do i have', 'whats there', 'whats filled in',
    'read the letters', 'pattern', 'letters', 'the letters', 'spell it'],
  help: ['help', 'what can i say', 'commands', 'options'],
  stop: ['stop', 'goodbye', 'bye', 'end', 'end session', 'quit', 'exit', 'were done', 'im done',
    'stop listening'],
  spell: ['spell', 'let me spell', 'let me spell it', 'ill spell it', 'spelling'],
  // Bare "anyway" matters: STT often keeps only that word from "say it anyway" (REQ-ANS-012).
  'enter-anyway': ['anyway', 'anyways', 'say it anyway', 'do it anyway', 'it anyway',
    'enter it anyway', 'enter anyway', 'force it', 'overwrite', 'put it in anyway',
    'replace it', 'use it anyway'],
  misheard: ['you misheard', 'you misheard me', 'thats not what i said', 'you heard wrong',
    'wrong word'],
  yes: ['yes', 'yeah', 'yep', 'sure', 'correct', 'right', 'do it'],
  no: ['no', 'nope', 'cancel', 'never mind', 'keep it', 'leave it'],
};

const STRATEGY_PHRASES = {
  'most-filled': ['switch to most filled', 'most filled first', 'switch to most solved',
    'most solved first'],
  'list-order': ['go in order', 'switch to list order', 'read in order', 'in order'],
};

const CHOICE_PHRASES = {
  0: ['first', 'the first one', 'first one', 'number one'],
  1: ['second', 'the second one', 'second one', 'number two'],
  2: ['third', 'the third one', 'third one', 'number three'],
};

const EXACT = new Map();
for (const [command, phrases] of Object.entries(PHRASES)) {
  for (const p of phrases) EXACT.set(p, { command });
}
for (const [arg, phrases] of Object.entries(STRATEGY_PHRASES)) {
  for (const p of phrases) EXACT.set(p, { command: 'strategy', arg });
}
for (const [idx, phrases] of Object.entries(CHOICE_PHRASES)) {
  for (const p of phrases) EXACT.set(p, { command: 'choice', arg: Number(idx) });
}

/**
 * @returns {{command: string, arg?: string|number} | null}
 *   Commands: next repeat hint help stop spell enter-anyway misheard(arg?) answer(arg)
 *             strategy(arg) yes no choice(arg). Contextual meaning is the machine's business.
 */
export function parseCommand(text) {
  const norm = normalizeUtterance(text);
  if (!norm) return null;

  const exact = EXACT.get(norm);
  if (exact) return { ...exact };

  let m = norm.match(/^(?:no )?i (?:meant|said) (.+)$/);
  if (m) return { command: 'misheard', arg: m[1] };

  // "spell a b c" — the command verb with the letters in the same breath. Only a pure
  // letter tail counts (letters, names, NATO); anything else is not a spelling start
  // ("spell trouble" stays an ordinary utterance for the answer pipeline).
  m = norm.match(/^(?:spell|spelling|let me spell) (.+)$/);
  if (m) {
    const { letters, control, ignored } = collectSpelledLetters(m[1]);
    if (letters.length && !control && !ignored) return { command: 'spell', arg: letters };
  }

  // "seven across" / "go to 22 down" — a clue label is a navigation command
  // (REQ-NAV-013). Only a real number counts; other "... down" utterances fall through.
  // STT often renders "across" as "a cross" or just "cross" (live report: "5 across"
  // never matched while "5 down" always did) — accept all three.
  m = norm.match(/^(?:go to |goto |jump to )?(.+?) (across|a cross|cross|down)$/);
  if (m) {
    const number = parseClueNumber(m[1]);
    const direction = m[2] === 'down' ? 'down' : 'across';
    if (number != null) return { command: 'goto', arg: { number, direction } };
    // "... across" can't be anything BUT navigation (unlike "... down" and "... cross",
    // which real answers end with — "falling down", "red cross" stay answer
    // candidates). A garbled number is reported instead of length-checking
    // "SIXACROSS" as a word.
    if (m[2] === 'across' || m[2] === 'a cross') {
      return { command: 'goto', arg: { number: null, direction } };
    }
  }

  m = norm.match(/^(?:the )?(?:answer|word|guess) (?:is )?(.+)$/) || norm.match(/^try (.+)$/);
  if (m) return { command: 'answer', arg: m[1] };

  return null;
}
