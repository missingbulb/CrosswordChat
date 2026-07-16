// Every English string the extension speaks, in one place (REQ-NFR-005).
// The machine emits semantic SAY payloads; this module renders them.
// Clue verbalization implements REQUIREMENTS §6 (READ-*).

export const OPTIONS = {
  // REQ-READ-004: also SAY the words "question mark" (intonation alone is voice-dependent).
  announceQuestionMark: true,
};

const ORDINALS = ['zeroth', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh',
  'eighth', 'ninth', 'tenth', 'eleventh', 'twelfth', 'thirteenth', 'fourteenth', 'fifteenth',
  'sixteenth', 'seventeenth', 'eighteenth', 'nineteenth', 'twentieth', 'twenty-first',
  'twenty-second', 'twenty-third', 'twenty-fourth', 'twenty-fifth'];

export function ordinal(n) {
  return ORDINALS[n] ?? `number ${n}`;
}

/** HEART → "Heart" (so TTS reads a word, not an acronym). */
function sayWord(word) {
  return word[0] + word.slice(1).toLowerCase();
}

/** HEART → "H, E, A, R, T". */
export function spellOut(word) {
  return word.split('').join(', ');
}

/**
 * Clue → spoken text (REQ-READ-001..011). The clue label ("17 Across") is deliberately
 * NOT spoken — the page highlight shows position (REQ-NAV-007). The letter count is
 * NOT spoken either (REQ-READ-008 retired): the user learns the length from a
 * length-mismatch report or the hint command when it actually matters.
 * @param {object} p {runs:[{text,italic}], greeting?}
 */
export function verbalizeClue({ runs, greeting = false }) {
  const plain = runs.map((r) => r.text).join('');
  const trimmed = plain.trim();

  // REQ-READ-003: whole-clue brackets are announced, bracket characters not spoken.
  const bracketed = /^\[.*\]$/s.test(trimmed);
  let body = bracketed ? trimmed.slice(1, -1).trim() : trimmed;

  // REQ-READ-005: runs of underscores are the word "blank".
  body = body.replace(/_{2,}/g, ' blank ').replace(/\s+/g, ' ').trim();

  // REQ-READ-004 / REQ-SPCH-006: keep terminal '?' for TTS intonation.
  const isQuestion = /\?$/.test(body);
  if (!/[.!?]$/.test(body)) body += '.';

  const annotations = [];

  // REQ-READ-002: italics.
  const italicRuns = runs.filter((r) => r.italic && r.text.trim());
  const nonEmptyRuns = runs.filter((r) => r.text.trim());
  if (italicRuns.length && italicRuns.length === nonEmptyRuns.length) {
    annotations.push('The whole clue is in italics.');
  } else {
    for (const run of italicRuns) {
      const span = run.text.trim();
      const kind = span.includes(' ') ? 'phrase' : 'word';
      annotations.push(`The ${kind} '${span}' is in italics.`);
    }
  }

  // REQ-READ-006: quotes — announced only when the WHOLE clue is quoted. Partial
  // quotes are too common to be worth an annotation (user feedback).
  if (/^["“].*["”]$/s.test(trimmed)) annotations.push('The clue is in quotes.');

  if (isQuestion && OPTIONS.announceQuestionMark) annotations.push('Question mark.');

  const parts = [];
  if (greeting) parts.push("Let's solve.");
  parts.push(bracketed ? `The clue is in brackets: ${body}` : body);
  parts.push(...annotations);
  return parts.join(' ');
}

/** Semantic SAY payload → English (see machine.js for the payload kinds). */
export function render(say) {
  switch (say.kind) {
    case 'clue':
      return verbalizeClue(say);
    case 'no-puzzle':
      return "I don't see a crossword puzzle here. Open a New York Times crossword and click me again.";
    case 'splash':
      return "The puzzle is waiting behind its start screen — click Play, and I'll jump right in.";
    case 'already-solved':
      return "This one's already solved — hooray! Nothing left for us to do.";
    case 'celebration':
      return 'Hooray — puzzle solved! Great work.';
    case 'grid-full-wrong':
      return "The grid is full, but something's not right yet. Say next to move around, or give a new answer to replace one.";
    case 'fit':
      // REQ-ANS-006: terse — the user just said the word, so don't echo it back. The
      // spell-out stays only when we accepted a different spelling than they voiced.
      return say.spelledDifferently ? `${spellOut(say.word)} — fits!` : 'Fits!';
    case 'override':
      // REQ-ANS-016: a new answer over a fully filled entry replaces it outright — no
      // confirmation. Just as terse as a fit, but named so the user hears the old word go.
      return say.spelledDifferently ? `${spellOut(say.word)} — override!` : 'Override!';
    case 'length-mismatch': {
      // REQ-ANS-007: only the problem — no "I heard ..." preamble, no usage coaching.
      // A homophone respelling (swaps > 0) sounds identical to the literal word when read
      // aloud, so naming it would hand the "same" word two lengths — length only instead.
      // When every variant is a respelling (the literal was rejected via "you misheard"),
      // no word is voiced at all: the lengths are the whole report.
      const named = say.variants.filter((v) => !v.swaps);
      const respelled = say.variants.filter((v) => v.swaps);
      const list = named.length
        ? named.map((v) => `${sayWord(v.word)} is ${v.len} letters`).join(', and ')
        : `That's ${respelled[0].len} letters`;
      const otherLens = (named.length ? respelled : respelled.slice(1)).map((v) => v.len);
      const others = otherLens.length ? `, or ${otherLens.join(' or ')} spelled differently` : '';
      // REQ-ANS-018: while spelling a partially solved entry, both counts work.
      const alsoOpen = say.open ? `, or ${say.open} for just the open squares` : '';
      return `${list}${others} — we need ${say.needed}${alsoOpen}.`;
    }
    case 'collision': {
      // REQ-ANS-008: quick — the first clash in full, the rest only as a count.
      // No options menu; anyway/new answer/next stay available (help lists them).
      const [first, ...rest] = say.collisions;
      const from = first.crossLabel ? `, from ${first.crossLabel}` : '';
      const more = rest.length ? `, and ${rest.length} more clash${rest.length > 1 ? 'es' : ''}` : '';
      return `${sayWord(say.word)} clashes — the ${ordinal(first.pos + 1)} letter is already ${first.have}${from}${more}.`;
    }
    case 'ambiguous': {
      const spelled = say.words.map((w) => spellOut(w)).join(', or ');
      const ask = say.words.length === 2 ? 'First or second?' : 'Which one?';
      return `That could be ${spelled}. ${ask}`;
    }
    case 'entering-anyway':
      return `Okay — entering ${sayWord(say.word)}.`;
    case 'hint': {
      const letters = say.pattern.map((l) => l ?? 'blank').join(', ');
      const summary = say.filled
        ? `${say.filled} of ${say.length} letters filled.`
        : 'Nothing filled in yet.';
      return `${letters}. ${summary}`;
    }
    case 'help':
      return 'You can: say an answer — whole or spelled out — or answer followed by a word. Say pass or next to skip, back for the previous clue, flip for the crossing clue, repeat to hear the clue again, hint for the letters so far, spell to spell a word, undo to take back the last answer, clear to empty the entry, pencil or pen to switch write modes, anyway to enter over a clash, or goodbye to stop.';
    case 'didnt-catch':
      return "Sorry, I didn't catch that.";
    case 'noise-hint':
      // REQ-SPCH-012: a reset storm (speech that never finalizes) gets named once.
      return "I'm having trouble hearing over the background noise.";
    case 'nothing-pending':
      return 'No word is waiting to be entered — give an answer first.';
    case 'misheard-reprompt':
      return "My mistake. What's your answer?";
    case 'spell-start': {
      // REQ-ANS-018: on a partially solved entry, offer spelling just the missing letters.
      const partial = say.open && say.open < say.length
        ? ` — the whole word, or just the ${say.open} missing letters`
        : '';
      return `Okay, spell it letter by letter${partial}. Say undo to remove one, done when you finish, or cancel to go back.`;
    }
    case 'spell-progress':
      return say.letters.length ? `${say.letters.join(', ')}.` : 'Nothing yet.';
    case 'spell-cancelled':
      return 'Okay, back to normal answers.';
    case 'undone':
      return 'Undone.';
    case 'nothing-to-undo':
      return "There's nothing to undo yet.";
    case 'cleared':
      return 'Cleared.';
    case 'mode-ack':
      return say.mode === 'pencil' ? 'Okay — penciling from here.' : 'Okay — pen from here.';
    case 'nothing-to-clear':
      return 'That entry is already empty.';
    case 'goto-didnt-catch':
      return "I didn't catch which clue — say the number and the direction, like five across.";
    case 'goto-need-number':
      return `Which number, going ${say.direction}?`;
    case 'no-crossing':
      return 'No crossing clue there.';
    case 'no-such-clue':
      return `There's no ${say.number} ${say.direction} in this puzzle.`;
    case 'goodbye':
      return 'Goodbye — happy solving!';
    case 'mic-denied':
      return "I can't hear you — microphone access is blocked. Allow the microphone for this extension in Chrome's site settings, then click the icon to start again.";
    case 'stt-error':
      return say.final
        ? "Speech recognition keeps failing — possibly a network problem. Let's stop here; click the icon to try again."
        : 'Speech recognition hiccupped. Let me try once more.';
    case 'entry-failed':
      return "I couldn't type that into the page. The page layout may have changed — try the probe button in the panel, or enter it by keyboard.";
    default:
      return String(say.text ?? '');
  }
}
