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

// A bare spoken number ("nine", "twenty two", "9") → integer, or null (REQ-NAV-013).
// Exposed for the goto-number recovery: after "<garbled> across", the machine holds the
// understood direction and asks for the number alone, which STT hears far more reliably
// than the whole label — a lone number heard next finishes the jump.
export function bareClueNumber(text) {
  const norm = normalizeUtterance(text);
  if (!norm) return null;
  return parseClueNumber(norm);
}

// A clue label ("22 down", "5 a cross") → {number, direction} (REQ-NAV-013). Either part
// may come back null when STT garbled it — the machine asks for the label rather than
// guessing. Used for the explicit "go to ..." prefix, where the whole tail is a label by
// construction: a missing direction is asked for, not treated as an answer.
function parseGotoLabel(tail) {
  const m = tail.match(/^(.+?) (across|a cross|cross|down)$/);
  if (m) {
    return { number: parseClueNumber(m[1]), direction: m[2] === 'down' ? 'down' : 'across' };
  }
  // No trailing direction word: the tail might be a bare number ("go to seven"). Report
  // the number when it parses; the machine asks which direction.
  return { number: parseClueNumber(tail), direction: null };
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

const CHOICE_PHRASES = {
  0: ['first', 'the first one', 'first one', 'number one'],
  1: ['second', 'the second one', 'second one', 'number two'],
  2: ['third', 'the third one', 'third one', 'number three'],
};

const EXACT = new Map();
for (const [command, phrases] of Object.entries(PHRASES)) {
  for (const p of phrases) EXACT.set(p, { command });
}
for (const [idx, phrases] of Object.entries(CHOICE_PHRASES)) {
  for (const p of phrases) EXACT.set(p, { command: 'choice', arg: Number(idx) });
}

/**
 * Every exact command surface phrase, for optional STT contextual biasing (REQ-SPCH-011).
 * These are the literal strings the recognizer would emit for a command, so boosting them
 * lifts command recognition without touching the matcher. Includes the "go to" prefix, which
 * parseCommand handles by regex rather than the exact map.
 * @returns {string[]}
 */
export function commandPhrases() {
  return [...EXACT.keys(), 'go to'];
}

/**
 * @returns {{command: string, arg?: string|number} | null}
 *   Commands: next repeat hint help stop spell enter-anyway misheard(arg?) answer(arg)
 *             yes no choice(arg). Contextual meaning is the machine's business.
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

  // "go to ..." is an explicit navigation prefix (REQ-NAV-013): whatever follows is meant
  // as a clue label, even when STT mangled the direction or dropped it. Parse the tail as
  // a label and always return a goto — a garbled number or a missing direction makes the
  // machine ask for the label, never dumps "go to ..." into the answer pipeline.
  m = norm.match(/^(?:go to|goto|go too|go two|go 2|jump to) (.+)$/);
  if (m) return { command: 'goto', arg: parseGotoLabel(m[1]) };

  // Bare "seven across" / "22 down" — a clue label is a navigation command (REQ-NAV-013).
  // Only a real number counts; other "... down" utterances fall through. STT often renders
  // "across" as "a cross" or just "cross" (live report: "5 across" never matched while
  // "5 down" always did) — accept all three.
  m = norm.match(/^(.+?) (across|a cross|cross|down)$/);
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

// High-signal single words that still identify a command when buried in a longer,
// mis-heard phrase (REQ-ANS-026). Deliberately narrow — only words unlikely to be part of
// a real answer — and only consulted AFTER an exact parse and answer evaluation have both
// failed on an utterance too long to be the answer. Contextual intents (yes/no/choice) are
// never fuzzy-matched.
const FUZZY_TRIGGERS = new Map();
for (const [word, command] of Object.entries({
  next: 'next', skip: 'next', pass: 'next',
  back: 'back', previous: 'back',
  flip: 'flip',
  undo: 'undo', undue: 'undo',
  clear: 'clear', delete: 'clear', erase: 'clear',
  repeat: 'repeat', again: 'repeat',
  hint: 'hint', hints: 'hint',
  help: 'help',
  stop: 'stop', goodbye: 'stop', quit: 'stop', exit: 'stop',
  spell: 'spell',
  pencil: 'pencil',
  anyway: 'enter-anyway', anyways: 'enter-anyway',
})) FUZZY_TRIGGERS.set(word, command);

/**
 * Last-resort command recognition for an utterance that was NOT a clean command and did
 * NOT evaluate as an answer (REQ-ANS-026). Scans the tokens for a single unambiguous
 * command word; returns null when none appear, or when two DIFFERENT commands do (a
 * genuine ambiguity we refuse to guess through).
 * @returns {{command: string} | null}
 */
export function fuzzyCommand(text) {
  const norm = normalizeUtterance(text);
  if (!norm) return null;
  let found = null;
  for (const tok of norm.split(' ')) {
    const command = FUZZY_TRIGGERS.get(tok);
    if (!command) continue;
    if (found && found !== command) return null; // conflicting commands — don't guess
    found = command;
  }
  return found ? { command: found } : null;
}
