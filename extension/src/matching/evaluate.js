// Utterance evaluation: STT alternatives × entry (length + pattern) → verdict.
// Implements the pipeline in REQUIREMENTS §8. Pure.

import { normalizedTokens } from './normalize.js';
import { homophonesOf, spellingsOfLetter, LETTER_NAMES, NATO } from './homophone-data.js';

const MAX_OPTIONS_PER_TOKEN = 6;
const MAX_COMBOS = 64;
const MAX_EXPANDABLE_TOKENS = 6;

// REQ-ANS-026: a reading this many letters longer than the entry is not treated as a
// wrong-length answer worth reporting — past this gap the mic almost certainly caught a
// command, a stray sentence, or the answer said twice, not a genuine attempt.
const OVERLONG_MARGIN = 4;

/**
 * All spellings of a token list, ordered literal-first then by number of homophone
 * substitutions (REQ-ANS-003). Each: {word, swaps}.
 */
export function expandCandidates(tokens) {
  if (!tokens.length) return [];
  const options = tokens.map((tok) => {
    // A bare single letter among other tokens is usually a pronounced letter NAME the
    // recognizer shortened ("d claw" for DECLAW) — its sound's spellings are candidates
    // too (REQ-ANS-021). Never for a letter alone: "d" is not the word DEE.
    const alts = tokens.length <= MAX_EXPANDABLE_TOKENS
      ? (tok.length === 1 && tokens.length > 1 ? spellingsOfLetter(tok) : homophonesOf(tok))
      : [];
    return [tok, ...alts.slice(0, MAX_OPTIONS_PER_TOKEN - 1)];
  });
  let combos = [{ word: '', swaps: 0 }];
  for (const opts of options) {
    const next = [];
    for (const combo of combos) {
      for (let i = 0; i < opts.length; i++) {
        next.push({ word: combo.word + opts[i], swaps: combo.swaps + (i > 0 ? 1 : 0) });
        if (next.length >= MAX_COMBOS * 4) break;
      }
      if (next.length >= MAX_COMBOS * 4) break;
    }
    combos = next;
  }
  combos.sort((a, b) => a.swaps - b.swaps);
  const seen = new Set();
  const out = [];
  for (const c of combos) {
    if (!/^[A-Z]+$/.test(c.word) || seen.has(c.word)) continue;
    seen.add(c.word);
    out.push(c);
    if (out.length >= MAX_COMBOS) break;
  }
  return out;
}

/**
 * "Say it, then spell it" (REQ-ANS-022): solvers often give the word and its spelling
 * in one breath — "dog, D, O, G". When a trailing run of spoken letters (bare, letter
 * names, NATO) spells the leading word — or one of its expansions, so "gray, G, R, E, Y"
 * follows the spelling — the utterance is ONE word, not the doubled-up join (DOGDOG).
 * Returns the spelled word, or null when the utterance doesn't have that shape.
 */
export function sayThenSpell(transcript) {
  const tokens = String(transcript ?? '')
    .toLowerCase()
    .replace(/[’‘']/g, '')
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  if (tokens.length < 2 || tokens.length > 12) return null;
  // Earliest split wins — the longest spelled suffix — so multi-word answers
  // ("a lot, A, L, O, T") compare whole (REQ-ANS-015).
  for (let k = 1; k < tokens.length; k++) {
    const { letters, control, ignored } = collectSpelledLetters(tokens.slice(k).join(' '));
    if (control || ignored || letters.length < 2) continue;
    const spelled = letters.join('');
    const said = normalizedTokens(tokens.slice(0, k).join(' '));
    if (said.length && expandCandidates(said).some((c) => c.word === spelled)) return spelled;
  }
  return null;
}

/** True iff word agrees with every non-null pattern letter. */
export function patternCompatible(word, pattern) {
  return pattern.every((p, i) => !p || p === word[i]);
}

/** Colliding positions: [{pos (0-based), want, have}] (REQ-ANS-008). */
export function collisionsWith(word, pattern) {
  const out = [];
  pattern.forEach((have, i) => {
    if (have && have !== word[i]) out.push({ pos: i, want: word[i], have });
  });
  return out;
}

/**
 * Evaluate an utterance against the current entry.
 *
 * @param {object} p
 * @param {Array<{transcript: string, confidence?: number}>} p.alternatives  STT n-best (REQ-ANS-004)
 * @param {number} p.entryLength
 * @param {Array<string|null>} p.pattern  current grid letters for the entry
 * @param {string[]} [p.rejected]  words the user said were misheard (REQ-ANS-010)
 * @param {boolean} [p.literalOnly]  skip homophone expansion (spelling mode)
 * @returns {{kind:'fit',word:string,spelledDifferently:boolean}
 *   | {kind:'ambiguous',words:string[]}
 *   | {kind:'collision',word:string,collisions:Array<{pos:number,want:string,have:string}>}
 *   | {kind:'length-mismatch',variants:Array<{word:string,len:number}>,needed:number}
 *   | {kind:'too-long',variants:Array<{word:string,len:number}>,needed:number}
 *   | {kind:'unintelligible'}}
 */
export function evaluate({ alternatives, entryLength, pattern, rejected = [], literalOnly = false }) {
  const rejectedSet = new Set(rejected.map((w) => String(w).toUpperCase()));
  const candidates = []; // {word, swaps, altIndex}
  let literalTop = null;

  alternatives.forEach((alt, altIndex) => {
    const tokens = normalizedTokens(alt.transcript);
    if (!tokens.length) return;
    if (altIndex === 0 || literalTop === null) literalTop ??= tokens.join('');
    if (!literalOnly) {
      // REQ-ANS-022: "dog, D, O, G" is the word DOG, not DOGDOG. Pushed first so a
      // mismatch report leads with the word the user actually meant; the plain join
      // stays a candidate below, so the length gate still decides.
      const echoed = sayThenSpell(alt.transcript);
      if (echoed) candidates.push({ word: echoed, swaps: 0, altIndex });
      // REQ-ANS-020: an utterance that is spoken letters throughout (bare, letter
      // names, NATO) is also a candidate as the spelled word — no mode needed.
      // Strict all-or-nothing: one non-letter token and the reading is off. Pushed
      // first so mismatch reports lead with it, not the letter-name concatenation;
      // it can never tie a same-length literal (equal length ⇒ identical ⇒ skipped).
      const { letters, control, ignored } = collectSpelledLetters(alt.transcript);
      if (!control && !ignored && letters.length >= 2) {
        const word = letters.join('');
        if (word !== tokens.join('')) candidates.push({ word, swaps: 0, altIndex });
      }
      // REQ-ANS-018 without the mode: exactly as many spoken letters as the entry has
      // open squares reads as "fill just those" — the grid supplies the rest. A single
      // letter is allowed here (one hole, one letter); ambiguity with a same-length
      // word reading is surfaced, never guessed (REQ-ANS-009).
      const open = pattern.filter((l) => !l).length;
      if (!control && !ignored && letters.length && letters.length === open && open < entryLength) {
        let next = 0;
        const word = pattern.map((have) => have ?? letters[next++]).join('');
        candidates.push({ word, swaps: 0, altIndex });
      }
    }
    const combos = literalOnly
      ? [{ word: tokens.join(''), swaps: 0 }]
      : expandCandidates(tokens);
    for (const c of combos) candidates.push({ ...c, altIndex });
  });

  if (!candidates.length) return { kind: 'unintelligible' };

  // Dedupe by word, keeping the best provenance (earliest alternative, fewest swaps).
  const byWord = new Map();
  for (const c of candidates) {
    if (rejectedSet.has(c.word)) continue;
    const prev = byWord.get(c.word);
    if (!prev || c.altIndex < prev.altIndex || (c.altIndex === prev.altIndex && c.swaps < prev.swaps)) {
      byWord.set(c.word, c);
    }
  }
  const unique = [...byWord.values()].sort((a, b) => a.altIndex - b.altIndex || a.swaps - b.swaps);
  if (!unique.length) return { kind: 'unintelligible' };

  const fitting = unique.filter((c) => c.word.length === entryLength);

  if (!fitting.length) {
    // Report what we heard with lengths, homophone variants included (REQ-ANS-007).
    // `swaps` rides along so the verbalizer can tell a homophone RESPELLING (sounds
    // identical spoken aloud — reported by length only) from a distinct heard word.
    const firstAlt = unique[0].altIndex;
    const fromTop = unique.filter((c) => c.altIndex === firstAlt);
    const variants = [];
    const seenLens = new Set();
    for (const c of fromTop) {
      if (variants.length && seenLens.has(c.word.length)) continue;
      variants.push({ word: c.word, len: c.word.length, swaps: c.swaps });
      seenLens.add(c.word.length);
      if (variants.length >= 3) break;
    }
    // REQ-ANS-026: when even the shortest thing we heard overshoots the entry by more
    // than OVERLONG_MARGIN letters, this is not a wrong-length answer to read back — it
    // is noise, a command, or the answer said twice. Flag it so the caller recovers
    // quietly instead of announcing "... is 200 letters, we need 5".
    const shortest = Math.min(...unique.map((c) => c.word.length));
    if (shortest > entryLength + OVERLONG_MARGIN) {
      return { kind: 'too-long', variants, needed: entryLength };
    }
    return { kind: 'length-mismatch', variants, needed: entryLength };
  }

  const patternOk = fitting.filter((c) => patternCompatible(c.word, pattern));

  if (patternOk.length) {
    const bestAlt = patternOk[0].altIndex;
    const group = patternOk.filter((c) => c.altIndex === bestAlt);
    if (group.length === 1) {
      const { word } = group[0];
      return { kind: 'fit', word, spelledDifferently: word !== literalTop };
    }
    // Same utterance, several valid spellings — never guess (REQ-ANS-009).
    return { kind: 'ambiguous', words: group.map((c) => c.word) };
  }

  const best = fitting[0];
  return { kind: 'collision', word: best.word, collisions: collisionsWith(best.word, pattern) };
}

/**
 * Spelling-mode letter collection (REQ-ANS-011).
 * Accepts bare letters, letter-name words (bee → B), and NATO words; understands
 * control words. Returns {letters, control:'done'|'undo'|'cancel'|null, ignored}.
 */
export function collectSpelledLetters(text) {
  const norm = String(text ?? '').toLowerCase().replace(/[’‘']/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  const CONTROLS = {
    done: ['done', 'thats it', 'thats all', 'finished', 'finish', 'enter', 'im done'],
    undo: ['undo', 'delete', 'back', 'backspace', 'scratch that', 'remove', 'remove that'],
    cancel: ['cancel', 'never mind', 'nevermind', 'stop spelling', 'forget it'],
  };
  for (const [control, phrases] of Object.entries(CONTROLS)) {
    if (phrases.includes(norm)) return { letters: [], control, ignored: 0 };
  }
  const tokens = norm.split(' ').filter(Boolean);
  const letters = [];
  let ignored = 0;
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    if (tok === 'double' && tokens[i + 1] === 'u') { // "double u" → W
      letters.push('W');
      i++;
      continue;
    }
    const up = tok.toUpperCase();
    if (/^[A-Z]$/.test(up)) letters.push(up);
    else if (NATO[up]) letters.push(NATO[up]);
    else if (LETTER_NAMES[up]) letters.push(LETTER_NAMES[up]);
    else ignored++;
  }
  return { letters, control: null, ignored };
}
