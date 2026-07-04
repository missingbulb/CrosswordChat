// Utterance evaluation: STT alternatives × entry (length + pattern) → verdict.
// Implements the pipeline in REQUIREMENTS §8. Pure.

import { normalizedTokens } from './normalize.js';
import { homophonesOf, LETTER_NAMES, NATO } from './homophone-data.js';

const MAX_OPTIONS_PER_TOKEN = 6;
const MAX_COMBOS = 64;
const MAX_EXPANDABLE_TOKENS = 6;

/**
 * All spellings of a token list, ordered literal-first then by number of homophone
 * substitutions (REQ-ANS-003). Each: {word, swaps}.
 */
export function expandCandidates(tokens) {
  if (!tokens.length) return [];
  const options = tokens.map((tok) => {
    const alts = tokens.length <= MAX_EXPANDABLE_TOKENS ? homophonesOf(tok) : [];
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
    const firstAlt = unique[0].altIndex;
    const fromTop = unique.filter((c) => c.altIndex === firstAlt);
    const variants = [];
    const seenLens = new Set();
    for (const c of fromTop) {
      if (variants.length && seenLens.has(c.word.length)) continue;
      variants.push({ word: c.word, len: c.word.length });
      seenLens.add(c.word.length);
      if (variants.length >= 3) break;
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
