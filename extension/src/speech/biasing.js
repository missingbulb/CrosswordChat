// Contextual-biasing phrase sets for the STT port (REQ-SPCH-011). Given the conversation
// state and the chosen experimental mode, returns a list of {phrase, boost} the port feeds
// to the Web Speech API's on-device recognizer (SpeechRecognition.phrases). Pure data +
// model reads — no browser APIs — but it lives under speech/ because it is an input to the
// recognizer, not part of the pure matcher (which must never know the recognizer exists).
//
// The recognizer takes no answer key (we never know the answer — §2), so we only ever bias
// the CLOSED vocabularies we control: the command lexicon, the loaded puzzle's real clue
// labels, and the spelling alphabet. Boosts are deliberately modest and named here so the
// experiments can be tuned in one place.

import { commandPhrases } from '../matching/commands.js';
import { LETTER_NAMES, NATO } from '../matching/homophone-data.js';
import { BIASING_MODES } from '../shared/biasing-modes.js';

export { BIASING_MODES }; // re-exported for convenience; single source is shared/biasing-modes.js

// Boosts (0.0–10.0). Modest by design: over-boosting commands makes the recognizer hear a
// command when the user gave a same-sounding answer. Crossing labels and NATO words — the
// highest-signal, least-ambiguous targets — get the strongest lift.
const BOOST = {
  command: 3.0,
  labelCrossing: 5.0, // the current entry's crossings — the likeliest "flip"/"go to" targets
  labelOther: 2.0,
  letter: 3.0, // a bare single letter ("J")
  nato: 5.0, // "juliet" — multi-syllable, acoustically distinct, so safe to boost hard
  letterName: 3.0, // "jay"
  spellControl: 3.0, // "done" / "undo" / "cancel" while spelling
  contextual: 5.0, // yes / no / first / second during a confirm or disambiguation prompt
};

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
const CONTEXTUAL_WORDS = ['yes', 'no', 'anyway', 'first', 'second', 'third'];
const SPELL_CONTROLS = ['done', 'undo', 'cancel'];

// The full spelling alphabet: bare letters, NATO words, and letter-name words. Boosting all
// three lifts the letter reading over the common WORD the recognizer otherwise returns
// ("bee"→B, "you"→U, "why"→Y) — the main win for 1–2 letter input. A single-token phrase is
// boosted wherever it lands in the utterance, so a mid-sequence "J" in "A B C D J" benefits.
function letterPhrases() {
  const out = LETTERS.map((letter) => ({ phrase: letter, boost: BOOST.letter }));
  for (const word of Object.keys(NATO)) out.push({ phrase: word.toLowerCase(), boost: BOOST.nato });
  for (const word of Object.keys(LETTER_NAMES)) out.push({ phrase: word.toLowerCase(), boost: BOOST.letterName });
  out.push({ phrase: 'double u', boost: BOOST.nato }); // W spelled out (REQ-ANS-011)
  return out;
}

// Every real clue label in the loaded puzzle ("12 across", "5 down"), NOT a blind 1..N — a
// label for a clue that doesn't exist only wastes budget and can mislead. The current
// entry's crossings are boosted highest (the likeliest navigation target).
function clueLabelPhrases(model, clueId) {
  const ids = model?.orderedClueIds ?? [];
  if (!ids.length) return [];
  const near = new Set();
  const clue = clueId && model?.clue?.(clueId);
  if (clue?.cellIndices) {
    clue.cellIndices.forEach((_, i) => {
      const cross = model.crossingAt?.(clueId, i);
      if (cross?.clueId) near.add(cross.clueId);
    });
  }
  return ids.map((id) => {
    const direction = id[0] === 'A' ? 'across' : 'down'; // ids are `A<n>` / `D<n>` (machine.js)
    return { phrase: `${id.slice(1)} ${direction}`, boost: near.has(id) ? BOOST.labelCrossing : BOOST.labelOther };
  });
}

// Open (still-blank) squares in the current entry — letters are worth biasing in normal mode
// only when the entry is short enough that the user is likely to spell it (REQ-ANS-018).
function openSquares(model, clueId) {
  const pattern = model?.patternFor?.(clueId);
  return pattern ? pattern.filter((letter) => !letter).length : null;
}

/**
 * Phrases to bias the next listen cycle toward, scoped to the current mode.
 * @param {object} p
 * @param {string} [p.biasing]  one of BIASING_MODES ('off' → no biasing)
 * @param {string} [p.mode]     the machine's sub-mode: 'normal'|'spelling'|'confirm-replace'|'disambiguating'
 * @param {object} [p.model]    the puzzle model (for clue labels / open-square count)
 * @param {string} [p.clueId]   the current clue id
 * @returns {Array<{phrase: string, boost: number}>}  deduped; [] when biasing is off/unknown
 */
export function phrasesFor({ biasing = 'off', mode = 'normal', model = null, clueId = null } = {}) {
  if (!BIASING_MODES.includes(biasing) || biasing === 'off') return [];
  const wantCommands = biasing === 'commands' || biasing === 'full';
  const wantSpelling = biasing === 'spelling' || biasing === 'full';
  const out = [];

  if (mode === 'spelling') {
    // The vocabulary is closed here — bias the whole alphabet hard.
    if (wantSpelling) {
      out.push(...letterPhrases());
      out.push(...SPELL_CONTROLS.map((word) => ({ phrase: word, boost: BOOST.spellControl })));
    }
    if (wantCommands) out.push({ phrase: 'stop', boost: BOOST.command }); // stop always escapes
  } else if (mode === 'confirm-replace' || mode === 'disambiguating') {
    out.push(...CONTEXTUAL_WORDS.map((word) => ({ phrase: word, boost: BOOST.contextual })));
    if (wantCommands) out.push(...commandPhrases().map((phrase) => ({ phrase, boost: BOOST.command })));
  } else { // normal
    if (wantCommands) {
      out.push(...commandPhrases().map((phrase) => ({ phrase, boost: BOOST.command })));
      out.push(...clueLabelPhrases(model, clueId));
    }
    if (wantSpelling) {
      const open = openSquares(model, clueId);
      if (open != null && open >= 1 && open <= 2) out.push(...letterPhrases());
    }
  }
  return dedupe(out);
}

// Keep the strongest boost per phrase (case-insensitive), preserving the phrase's own casing.
function dedupe(phrases) {
  const best = new Map();
  for (const { phrase, boost } of phrases) {
    if (!phrase) continue;
    const key = phrase.toLowerCase();
    const prev = best.get(key);
    if (!prev || boost > prev.boost) best.set(key, { phrase, boost });
  }
  return [...best.values()];
}
