// Command lexicon (REQ-CMD-001). Matched on the whole normalized utterance;
// answers get an escape hatch via "answer ..." (REQ-ANS-014).

import { normalizeUtterance } from './normalize.js';

const PHRASES = {
  next: ['next', 'next clue', 'next one', 'pass', 'pass on this', 'skip', 'skip it',
    'skip this one', 'move on'],
  back: ['back', 'go back', 'previous', 'previous clue', 'previous one'],
  flip: ['flip', 'flip it', 'switch direction', 'change direction', 'other direction'],
  // "undue" is what STT usually makes of "undo" (REQ-ANS-017).
  undo: ['undo', 'undue', 'undo that', 'undo it', 'take that back', 'take it back'],
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

  m = norm.match(/^(?:the )?(?:answer|word|guess) (?:is )?(.+)$/) || norm.match(/^try (.+)$/);
  if (m) return { command: 'answer', arg: m[1] };

  return null;
}
