// Conversation policy: pure reducer (state, event) → {state, actions}.
// No browser APIs, no English strings (see phrases.js), no DOM (see page-adapter).
//
// Events in:  START TTS_DONE HEARD BARGE_IN STT_ERROR ENTRY_RESULT UNDO_RESULT
//             PAGE_EVENT TOGGLE_OFF
// Actions out: SAY LISTEN ENTER UNDO SELECT_CLUE END
//
// Echo discipline (REQ-SPCH-005): LISTEN is never emitted in the same action batch
// as SAY — the formal mic opens only after speech finishes (TTS_DONE → after:'listen').
// The shell's barge-in mic (REQ-SPCH-009) delivers mid-speech input as ordinary HEARD
// events (honored while after:'listen'), and stop during other speech as BARGE_IN.

import { buildModel } from '../puzzle-model/model.js';
import { nextClue, prevClue, STRATEGIES } from './strategies.js';
import { evaluate, collectSpelledLetters } from '../matching/evaluate.js';
import { parseCommand, fuzzyCommand, bareClueNumber } from '../matching/commands.js';

export function initialState() {
  return { phase: 'idle' };
}

// REQ-CMD-005: how long we listen without hearing anything before quietly stopping.
// This is a thinking game — pauses are normal, so nothing is ever said about silence.
export const SILENCE_TIMEOUT_MS = 60_000;

const say = (payload) => ({ type: 'SAY', say: payload });
const CONTEXTUAL = new Set(['yes', 'no', 'choice']);

/**
 * REQ-ANS-026: an over-long reading that is exactly the same string twice — the answer
 * spoken twice ("HEART HEART" → HEARTHEART). Returns the single copy, or null.
 */
function doubledHalf(word) {
  if (word.length >= 2 && word.length % 2 === 0) {
    const half = word.slice(0, word.length / 2);
    if (half === word.slice(word.length / 2)) return half;
  }
  return null;
}

function clueSay(model, clueId, extra = {}) {
  const clue = model.clue(clueId);
  // No answerLength: the letter count is not announced up front (REQ-READ-008 retired) —
  // the user learns it from a length-mismatch report or the hint command. `len` is for
  // the diagnostics log only (REQ-DIAG-001); the verbalizer never speaks it.
  return {
    kind: 'clue',
    label: clue.label,
    runs: clue.runs,
    len: clue.cellIndices.length,
    ...extra,
  };
}

/**
 * The machine's soft-cell ledger (REQ-ANS-023 / REQ-PAGE-012): cells the extension
 * itself penciled (REQ-ANS-019 softening), index → letter. The live page exposes no
 * readable pencil marker, so models are always built WITH the ledger — a penciled-by-us
 * letter must never gate an answer just because the page can't confirm it's soft.
 */
function remodel(state, snapshot) {
  return buildModel(snapshot, { softCells: state.softCells ?? {} });
}

/** Entries currently holding penciled letters — the suspects once the grid is full (REQ-NAV-014). */
function pencilledClueIds(model) {
  return model.orderedClueIds.filter((id) => model.pencilFor(id).some(Boolean));
}

/** The next suspect after fromId in list order, cycling (fromId itself checked last). */
function nextPencilled(model, fromId) {
  const suspects = new Set(pencilledClueIds(model));
  if (!suspects.size) return null;
  const order = model.orderedClueIds;
  const from = Math.max(order.indexOf(fromId), 0);
  for (let step = 1; step <= order.length; step++) {
    const id = order[(from + step) % order.length];
    if (suspects.has(id)) return id;
  }
  return null;
}

/** Transition into speaking; `after` = what TTS_DONE should do: 'listen' | 'end' | 'enter'. */
function speak(state, actions, after) {
  return { state: { ...state, phase: 'speaking', after }, actions };
}

function listenAgain(state, sayPayloads) {
  return speak(state, sayPayloads.map(say), 'listen');
}

/** A failed answer attempt on the current entry — counts toward the struggle streak that
 * arms the spelling-alphabet biasing (REQ-SPCH-011). */
function missed(state) {
  return { ...state, missStreak: (state.missStreak ?? 0) + 1 };
}

function readClue(state, extra = {}, leadActions = []) {
  return speak(state, [...leadActions, say(clueSay(state.model, state.clueId, extra))], 'listen');
}

/** Land on a clue with a clean slate: sub-mode, buffers, and pending work all reset. */
function moveTo(state, clueId) {
  return {
    ...state,
    clueId,
    mode: 'normal',
    rejected: [],
    lastProposed: null,
    pendingWord: null,
    pendingEntry: null,
    spellBuffer: [],
    disambigWords: [],
    undoSay: null,
    pendingCorrection: null,
    pendingGotoDir: null,
    missStreak: 0, // REQ-SPCH-011: a fresh clue is a fresh start for the struggle counter
  };
}

/**
 * Revert the last entry (REQ-ANS-017). `sayKind` is spoken once the page confirms.
 * `rejected`/`correction` serve the misheard merge (REQ-ANS-010): the undone word is
 * excluded from re-matching, and an "I said X" correction is evaluated after the revert.
 */
function startUndo(state, { sayKind = 'undone', rejected = [], correction = null } = {}) {
  const { clueId, before, beforePencil = [], penciled = [] } = state.lastEntry;
  const cells = [
    // letter null → clear the cell; overwritten letters return with the pencil
    // state they had before the entry.
    ...state.model.clue(clueId).cellIndices
      .map((index, i) => (before[i] && beforePencil[i]
        ? { index, letter: before[i], pencil: true }
        : { index, letter: before[i] })),
    // REQ-ANS-019: letters the entry softened go back to pen — explicitly, since
    // only the mode changes (the letters are already in the grid).
    ...penciled.map(({ index, letter }) => ({ index, letter, pencil: false })),
  ];
  return {
    state: {
      ...moveTo(state, clueId),
      phase: 'undoing',
      lastEntry: null,
      // The revert also restores the ledger to its pre-entry state (REQ-ANS-023).
      softCells: state.lastEntry.softBefore ?? state.softCells ?? {},
      rejected,
      undoSay: sayKind,
      pendingCorrection: correction,
    },
    actions: [
      { type: 'SELECT_CLUE', clueId },
      { type: 'UNDO', clueId, cells },
    ],
  };
}

// Forward navigation leaves a breadcrumb so "back" can retrace the session's own path
// under most-filled (REQ-NAV-009). Bounded: a courtesy trail, not a full session log.
const TRAIL_MAX = 50;
function leaveCrumb(state) {
  if (!state.clueId) return state;
  return { ...state, trail: [...state.trail, state.clueId].slice(-TRAIL_MAX) };
}

/** Navigate to a clue, sync the page, and read it. No breadcrumb — "back" uses this. */
function jumpTo(state, clueId) {
  const s = moveTo(state, clueId);
  return speak(s, [
    { type: 'SELECT_CLUE', clueId },
    say(clueSay(s.model, clueId)),
  ], 'listen');
}

/** Forward navigation (flip/goto — REQ-NAV-010/013): jumpTo plus a breadcrumb. */
function goTo(state, clueId) {
  return jumpTo(leaveCrumb(state), clueId);
}

/**
 * Skip records still standing (REQ-NAV-011): a record dies when its entry fills up or
 * its letter count changes — a changed entry earned a fresh look (new ratio, new odds).
 */
function liveSkips(state) {
  return state.skipped.filter(({ clueId, filled }) => {
    const p = state.model.progressFor(clueId);
    return p.filled === filled && p.filled < p.length;
  });
}

/** An explicit "next" skips the current clue: remember it + its letter count (REQ-NAV-011). */
function recordSkip(state) {
  const p = state.model.progressFor(state.clueId);
  if (p.filled >= p.length) return state; // leaving a filled entry is not a skip
  const skipped = [
    ...state.skipped.filter((e) => e.clueId !== state.clueId),
    { clueId: state.clueId, filled: p.filled },
  ];
  return { ...state, skipped };
}

function advance(from, leadSays = []) {
  const state = leaveCrumb(from); // "back" can return to the clue being left (REQ-NAV-009)
  const skipped = liveSkips(state);
  const next = nextClue(state.model, state.clueId, state.strategy, skipped.map((e) => e.clueId));
  if (!next) {
    // Nothing unfilled anywhere (REQ-LIFE-006 / REQ-NAV-003): "next" still moves. The
    // penciled entries are the suspects on a full-but-wrong grid, so "next" patrols
    // THEM when any exist (REQ-NAV-014); otherwise forward through the filled clues in
    // list order, reading each one. The grid-full coaching played once when the grid
    // filled up; repeating it here would loop.
    const order = state.model.orderedClueIds;
    const at = Math.max(order.indexOf(state.clueId), 0);
    const target = nextPencilled(state.model, state.clueId) ?? order[(at + 1) % order.length];
    const s = moveTo({ ...state, skipped }, target);
    return speak(s, [
      ...leadSays.map(say),
      { type: 'SELECT_CLUE', clueId: s.clueId },
      say(clueSay(s.model, s.clueId)),
    ], 'listen');
  }
  // Landing on a clue clears its skip record — skipping it again re-files it as newest.
  const s = {
    ...moveTo(state, next.clueId),
    skipped: skipped.filter((e) => e.clueId !== next.clueId),
  };
  return speak(s, [
    ...leadSays.map(say),
    { type: 'SELECT_CLUE', clueId: next.clueId },
    say(clueSay(s.model, s.clueId)),
  ], 'listen');
}

/** Accept a fitting word: replace-confirmation when overwriting (REQ-ANS-016), else enter. */
function finishFit(state, word, spelledDifferently) {
  const current = state.model.wordFor(state.clueId);
  if (current && current !== word) {
    // lastProposed too: "you misheard" during the confirmation rejects this word.
    // missStreak resets here as on any fit: recognition succeeded (REQ-SPCH-011).
    return listenAgain(
      { ...state, mode: 'confirm-replace', pendingWord: word, lastProposed: word, spellBuffer: [], missStreak: 0 },
      [{ kind: 'replace-confirm', word, current }],
    );
  }
  return speak(
    { ...state, mode: 'normal', pendingWord: word, lastProposed: word, pendingEntry: { word }, spellBuffer: [], missStreak: 0 },
    [say({ kind: 'fit', word, spelledDifferently })],
    'enter',
  );
}

/**
 * The current entry's pattern as ANSWER EVALUATION sees it. Fully filled entries gate
 * on length only (their letters are what a new answer would replace, REQ-ANS-016).
 * Penciled letters never gate either (REQ-ANS-023): they are the solver's own "not
 * sure" marks, so a clashing answer simply writes over them — those squares evaluate
 * as open. Only pen letters on a partially filled entry produce collisions.
 */
function evalPattern(state) {
  const raw = state.model.patternFor(state.clueId);
  if (state.model.wordFor(state.clueId)) return raw.map(() => null);
  const pencil = state.model.pencilFor(state.clueId);
  return raw.map((letter, i) => (pencil[i] ? null : letter));
}

function evaluateAnswer(state, alternatives) {
  const pattern = evalPattern(state);
  const outcome = evaluate({
    alternatives,
    entryLength: pattern.length,
    pattern,
    rejected: state.rejected,
  });
  switch (outcome.kind) {
    case 'fit':
      return finishFit(state, outcome.word, outcome.spelledDifferently);
    case 'ambiguous':
      return listenAgain(
        { ...state, mode: 'disambiguating', disambigWords: outcome.words },
        [{ kind: 'ambiguous', words: outcome.words }],
      );
    case 'collision': {
      // Enrich with crossing labels (REQ-ANS-008); positions are 0-based here.
      const collisions = outcome.collisions.map((c) => ({
        ...c,
        crossLabel: state.model.crossingAt(state.clueId, c.pos)?.label ?? null,
      }));
      return listenAgain(
        { ...state, mode: 'normal', pendingWord: outcome.word, lastProposed: outcome.word },
        [{ kind: 'collision', word: outcome.word, collisions }],
      );
    }
    case 'length-mismatch':
      // A failed answer attempt: count it toward the struggle streak that arms the
      // spelling-alphabet biasing (REQ-SPCH-011) — spelling is the user's likely next move.
      return listenAgain(
        { ...state, lastProposed: outcome.variants[0].word, missStreak: (state.missStreak ?? 0) + 1 },
        [{ kind: 'length-mismatch', variants: outcome.variants, needed: outcome.needed }],
      );
    case 'too-long': {
      // REQ-ANS-026: the utterance overshoots the entry by more than four letters, so it
      // is not the answer. Try the "said it twice" reading (HEART HEART → HEARTHEART →
      // HEART); failing that, hand back to the caller — a fuzzy command match, then a
      // plain didn't-catch — rather than reading the frustrating length report aloud.
      const half = doubledHalf(outcome.variants[0]?.word ?? '');
      if (half) return evaluateAnswer(state, [{ transcript: half }]);
      return null;
    }
    default:
      return null; // unintelligible — caller picks the fallback
  }
}

function handleCommand(state, cmd) {
  switch (cmd.command) {
    case 'next':
      return advance(recordSkip(state)); // REQ-NAV-011: an explicit skip is remembered
    case 'back': {
      // REQ-NAV-009: under most-filled, "next" jumps by fill ratio, so "previous in
      // list order" would be a non sequitur — "back" retraces the trail of clues this
      // session actually visited, newest first. List order (filled entries included)
      // remains the meaning under list order, and the fallback once the trail runs
      // dry. Back never leaves a breadcrumb of its own: a chain of "back"s walks
      // steadily backward instead of ping-ponging between two clues.
      if (state.strategy === 'most-filled') {
        const trail = [...state.trail];
        while (trail.length) {
          const crumb = trail.pop();
          if (crumb !== state.clueId && state.model.clue(crumb)) {
            return jumpTo({ ...state, trail }, crumb);
          }
        }
      }
      return jumpTo(state, prevClue(state.model, state.clueId).clueId);
    }
    case 'flip': { // REQ-NAV-010: jump to the crossing clue AT THE SELECTED SQUARE
      const clue = state.model.clue(state.clueId);
      // The page highlight marks the square the user means (live report: flipping
      // from the first letter instead of the cursor felt wrong). Only a selection
      // inside the current entry counts; otherwise scan from the entry's start.
      const selected = clue.cellIndices.indexOf(state.model.snapshot.selection?.cellIndex);
      let cross = selected >= 0 ? state.model.crossingAt(state.clueId, selected) : null;
      for (let i = 0; i < clue.cellIndices.length && !cross; i++) {
        cross = state.model.crossingAt(state.clueId, i);
      }
      if (!cross) return listenAgain(state, [{ kind: 'no-crossing' }]);
      return goTo(state, cross.clueId);
    }
    case 'undo': // REQ-ANS-017: revert the last entry we made
      if (!state.lastEntry) return listenAgain(state, [{ kind: 'nothing-to-undo' }]);
      return startUndo(state);
    case 'pencil': // REQ-ANS-025: answers land penciled from here on
      return listenAgain({ ...state, writeMode: 'pencil' }, [{ kind: 'mode-ack', mode: 'pencil' }]);
    case 'pen': // …and back to pen
      return listenAgain({ ...state, writeMode: 'pen' }, [{ kind: 'mode-ack', mode: 'pen' }]);
    case 'clear': { // REQ-ANS-024: empty the current entry; "undo" brings it back
      const before = state.model.patternFor(state.clueId);
      if (!before.some(Boolean)) return listenAgain(state, [{ kind: 'nothing-to-clear' }]);
      const clue = state.model.clue(state.clueId);
      return {
        // Rides the UNDO write machinery (a null letter clears the cell) and leaves a
        // lastEntry restore record, so a later "undo" re-enters everything the clear
        // removed — pencil states included.
        state: {
          ...moveTo(state, state.clueId),
          phase: 'undoing',
          lastEntry: {
            clueId: state.clueId,
            before,
            beforePencil: state.model.pencilFor(state.clueId),
            penciled: [],
            softBefore: state.softCells,
          },
          undoSay: 'cleared',
        },
        actions: [{
          type: 'UNDO',
          clueId: state.clueId,
          cells: clue.cellIndices.map((index) => ({ index, letter: null })),
        }],
      };
    }
    case 'goto': { // REQ-NAV-013: jump straight to a clue by its spoken label
      // The direction came through but the number didn't (STT drops the short number far
      // more than the direction word) — don't throw the understood half away. Hold the
      // direction and ask for the number alone; a bare number then finishes the jump
      // (goto-number sub-mode, onHeardGotoNumber).
      if (cmd.arg.direction != null && cmd.arg.number == null) {
        return listenAgain(
          { ...state, mode: 'goto-number', pendingGotoDir: cmd.arg.direction },
          [{ kind: 'goto-need-number', direction: cmd.arg.direction }],
        );
      }
      // Neither part parsed, or a "go to" with no direction at all — ask for the whole label
      // instead of dumping the utterance into the answer pipeline.
      if (cmd.arg.number == null || cmd.arg.direction == null) {
        return listenAgain(state, [{ kind: 'goto-didnt-catch' }]);
      }
      const id = `${cmd.arg.direction === 'across' ? 'A' : 'D'}${cmd.arg.number}`;
      if (!state.model.clue(id)) {
        return listenAgain(state, [{
          kind: 'no-such-clue', number: cmd.arg.number, direction: cmd.arg.direction,
        }]);
      }
      return goTo(state, id);
    }
    case 'repeat':
      return readClue({ ...state, mode: 'normal' }); // REQ-READ-009
    case 'hint': {
      const pattern = state.model.patternFor(state.clueId);
      return listenAgain(state, [{
        kind: 'hint',
        pattern,
        filled: pattern.filter(Boolean).length,
        length: pattern.length,
      }]);
    }
    case 'help':
      return listenAgain(state, [{ kind: 'help' }]);
    case 'stop':
      return speak({ ...state, endReason: 'goodbye' }, [say({ kind: 'goodbye' })], 'end'); // REQ-CMD-004
    case 'spell': {
      const pattern = evalPattern(state); // penciled squares count as open (REQ-ANS-023)
      const open = pattern.filter((l) => !l).length;
      // "spell a b c" — the letters arrived with the verb (REQ-CMD-001). A complete
      // count (full word, or exactly the open squares) evaluates right away; anything
      // shorter seeds the buffer and continues letter by letter.
      if (cmd.arg?.length) {
        const s = { ...state, mode: 'spelling', spellBuffer: cmd.arg };
        if (cmd.arg.length >= pattern.length || (open && cmd.arg.length === open)) {
          return finishSpelling(s, cmd.arg);
        }
        return listenAgain(s, [{ kind: 'spell-progress', letters: cmd.arg }]);
      }
      // REQ-ANS-018: the opening prompt offers the just-the-open-squares option.
      return listenAgain(
        { ...state, mode: 'spelling', spellBuffer: [] },
        [{ kind: 'spell-start', open, length: pattern.length }],
      );
    }
    case 'enter-anyway': // REQ-ANS-012
      if (!state.pendingWord) {
        // Nothing is waiting to be forced in — say so plainly. If ANYWAY is genuinely
        // the answer, the REQ-ANS-014 escape hatch ("answer anyway") still enters it.
        return listenAgain(state, [{ kind: 'nothing-pending' }]);
      }
      return speak(
        { ...state, mode: 'normal', pendingEntry: { word: state.pendingWord } },
        [say({ kind: 'entering-anyway', word: state.pendingWord })],
        'enter',
      );
    case 'misheard': { // REQ-ANS-010
      // With nothing proposed on this clue, the misheard word is the one we already
      // ENTERED (it fit and we moved on) — so the correction starts with an undo.
      const entered = !state.lastProposed && state.lastEntry;
      const undoneWord = entered ? state.model.wordFor(state.lastEntry.clueId) : null;
      if (cmd.arg) {
        if (entered) return startUndo(state, { rejected: [undoneWord].filter(Boolean), correction: cmd.arg });
        return evaluateAnswer(state, [{ transcript: cmd.arg }])
          ?? listenAgain(missed(state), [{ kind: 'didnt-catch' }]);
      }
      if (entered) {
        return startUndo(state, { sayKind: 'misheard-reprompt', rejected: [undoneWord].filter(Boolean) });
      }
      const rejected = state.lastProposed
        ? [...state.rejected, state.lastProposed]
        : state.rejected;
      return listenAgain({ ...state, rejected, pendingWord: null }, [{ kind: 'misheard-reprompt' }]);
    }
    case 'answer': // REQ-ANS-014
      return evaluateAnswer(state, [{ transcript: cmd.arg }])
        ?? listenAgain(missed(state), [{ kind: 'didnt-catch' }]);
    default:
      return null;
  }
}

function finishSpelling(state, buffer) {
  const pattern = evalPattern(state); // penciled squares count as open (REQ-ANS-023)
  const open = pattern.filter((l) => !l).length;
  // REQ-ANS-018: on a partially solved entry, exactly as many letters as there are open
  // squares means "fill just those" — the grid's letters supply the rest of the word.
  // Only reachable via an explicit "done": auto-evaluation fires at full entry length.
  if (buffer.length === open && open < pattern.length) {
    let next = 0;
    const word = pattern.map((have) => have ?? buffer[next++]).join('');
    // spelledDifferently: the user voiced only part of the word, so read it back whole.
    return finishFit({ ...state, mode: 'normal', spellBuffer: [] }, word, true);
  }
  const word = buffer.join('');
  const outcome = evaluate({
    alternatives: [{ transcript: word }],
    entryLength: pattern.length,
    pattern,
    rejected: [],
    literalOnly: true,
  });
  if (outcome.kind === 'fit') {
    return finishFit({ ...state, mode: 'normal', spellBuffer: [] }, word, false);
  }
  if (outcome.kind === 'collision') {
    const collisions = outcome.collisions.map((c) => ({
      ...c,
      crossLabel: state.model.crossingAt(state.clueId, c.pos)?.label ?? null,
    }));
    return listenAgain(
      { ...state, mode: 'normal', spellBuffer: [], pendingWord: word, lastProposed: word },
      [{ kind: 'collision', word, collisions }],
    );
  }
  // length-mismatch: keep the buffer; the user can undo/continue/cancel (REQ-ANS-011).
  // On a partially solved entry, name the open-square count too (REQ-ANS-018).
  return listenAgain(state, [{
    kind: 'length-mismatch',
    variants: [{ word, len: word.length }],
    needed: pattern.length,
    ...(open && open < pattern.length ? { open } : {}),
  }]);
}

function onHeardSpelling(state, alternatives) {
  const top = alternatives[0]?.transcript ?? '';
  const cmd = parseCommand(top);
  if (cmd?.command === 'stop') return speak({ ...state, endReason: 'goodbye' }, [say({ kind: 'goodbye' })], 'end');
  const { letters, control } = collectSpelledLetters(top);
  if (control === 'cancel') {
    return listenAgain({ ...state, mode: 'normal', spellBuffer: [] }, [{ kind: 'spell-cancelled' }]);
  }
  if (control === 'undo') {
    const spellBuffer = state.spellBuffer.slice(0, -1);
    return listenAgain({ ...state, spellBuffer }, [{ kind: 'spell-progress', letters: spellBuffer }]);
  }
  if (control === 'done') return finishSpelling(state, state.spellBuffer);
  if (letters.length) {
    const spellBuffer = [...state.spellBuffer, ...letters];
    const entryLength = state.model.patternFor(state.clueId).length;
    if (spellBuffer.length >= entryLength) {
      return finishSpelling({ ...state, spellBuffer }, spellBuffer);
    }
    return listenAgain({ ...state, spellBuffer }, [{ kind: 'spell-progress', letters: spellBuffer }]);
  }
  // Not letters, not a spelling control: every ordinary command still works here —
  // spelling must never trap the user (minimal modes). Handling one leaves spelling.
  if (cmd && !CONTEXTUAL.has(cmd.command)) {
    const handled = handleCommand({ ...state, mode: 'normal', spellBuffer: [] }, cmd);
    if (handled) return handled;
  }
  return listenAgain(state, [{ kind: 'didnt-catch' }]);
}

function onHeardDisambig(state, alternatives) {
  const top = alternatives[0]?.transcript ?? '';
  const cmd = parseCommand(top);
  if (cmd?.command === 'choice') { // REQ-ANS-009
    const word = state.disambigWords[cmd.arg];
    if (!word) return listenAgain(state, [{ kind: 'didnt-catch' }]);
    return finishFit({ ...state, mode: 'normal', disambigWords: [] }, word, true);
  }
  const reset = { ...state, mode: 'normal', disambigWords: [] };
  if (cmd && !CONTEXTUAL.has(cmd.command)) {
    return handleCommand(reset, cmd) ?? listenAgain(reset, [{ kind: 'didnt-catch' }]);
  }
  return evaluateAnswer(reset, alternatives) ?? listenAgain(reset, [{ kind: 'didnt-catch' }]);
}

function onHeardConfirm(state, alternatives) {
  const top = alternatives[0]?.transcript ?? '';
  const cmd = parseCommand(top);
  // "anyway" counts as yes here — it is an explicit go-ahead (REQ-ANS-012/016).
  if ((cmd?.command === 'yes' || cmd?.command === 'enter-anyway') && state.pendingWord) {
    return speak(
      { ...state, mode: 'normal', pendingEntry: { word: state.pendingWord } },
      [say({ kind: 'entering-anyway', word: state.pendingWord })],
      'enter',
    );
  }
  if (cmd?.command === 'no') {
    return listenAgain({ ...state, mode: 'normal', pendingWord: null }, [{ kind: 'kept' }]);
  }
  return onHeardNormal({ ...state, mode: 'normal', pendingWord: null }, alternatives);
}

// REQ-NAV-013: after "<garbled> across", the direction is held (pendingGotoDir) and we
// asked for the number alone. Like every sub-mode, it never traps the user.
function onHeardGotoNumber(state, alternatives) {
  const reset = { ...state, mode: 'normal', pendingGotoDir: null };
  const top = alternatives[0]?.transcript ?? '';
  const cmd = parseCommand(top);
  // A full label ("seven down") supersedes the remembered direction.
  if (cmd?.command === 'goto') return handleCommand(reset, cmd);
  // The number alone, in the direction we already understood, completes the jump.
  const number = bareClueNumber(top);
  if (number != null) {
    return handleCommand(reset, { command: 'goto', arg: { number, direction: state.pendingGotoDir } });
  }
  // Any other ordinary command still works — leaving the sub-mode behind.
  if (cmd && !CONTEXTUAL.has(cmd.command)) {
    const handled = handleCommand(reset, cmd);
    if (handled) return handled;
  }
  // No usable number — drop back to normal listening with the generic reprompt.
  return listenAgain(reset, [{ kind: 'goto-didnt-catch' }]);
}

function onHeardNormal(state, alternatives) {
  const top = alternatives[0]?.transcript ?? '';
  const cmd = parseCommand(top);
  if (cmd && !CONTEXTUAL.has(cmd.command)) {
    const handled = handleCommand(state, cmd);
    if (handled) return handled;
  }
  const evaluated = evaluateAnswer(state, alternatives);
  if (evaluated) return evaluated;
  // Nothing usable — maybe a lower-confidence alternative was the command (REQ-ANS-004).
  for (const alt of alternatives.slice(1)) {
    const altCmd = parseCommand(alt.transcript);
    if (altCmd && !CONTEXTUAL.has(altCmd.command)) {
      const handled = handleCommand(state, altCmd);
      if (handled) return handled;
    }
  }
  // Still nothing. When the utterance was too long to be an answer (REQ-ANS-026), a
  // command word may be hiding in the noise ("uh, let's just go to the next one") — pluck
  // it out fuzzily before giving up.
  for (const alt of alternatives) {
    const fuzzy = fuzzyCommand(alt.transcript);
    if (fuzzy && !CONTEXTUAL.has(fuzzy.command)) {
      const handled = handleCommand(state, fuzzy);
      if (handled) return handled;
    }
  }
  // Nothing usable at all is a failed answer attempt too (REQ-SPCH-011 struggle counter).
  return listenAgain(missed(state), [{ kind: 'didnt-catch' }]); // REQ-CMD-003
}

function onStart(state, { snapshot, settings }) {
  if (snapshot.status === 'not-found') {
    return speak({ ...state, phase: 'speaking', endReason: 'no-puzzle' }, [say({ kind: 'no-puzzle' })], 'end'); // REQ-LIFE-003
  }
  if (snapshot.status === 'solved') {
    return speak({ ...state, phase: 'speaking', endReason: 'already-solved' }, [say({ kind: 'already-solved' })], 'end'); // REQ-LIFE-004
  }
  const model = buildModel(snapshot);
  const selected = snapshot.selection?.clueId;
  // REQ-NAV-014: a full-but-wrong grid opens on a penciled entry — the uncertain
  // letters are where the fix most likely lives. Otherwise the page selection wins
  // (REQ-LIFE-007), then the first unfilled clue.
  const suspects = model.isFull() ? pencilledClueIds(model) : [];
  const clueId = (selected && model.clue(selected) && (!suspects.length || suspects.includes(selected)))
    ? selected
    : suspects[0] ?? model.firstUnfilled(); // REQ-LIFE-007
  const s = {
    phase: 'speaking',
    after: 'listen',
    model,
    clueId,
    softCells: {}, // REQ-ANS-023: what WE penciled this session (index → letter)
    writeMode: 'pen', // REQ-ANS-025: flipped by the pencil/pen commands
    // REQ-NAV-012: the persisted setting seeds the strategy; anything unrecognized
    // (corrupt storage, older versions) falls back to list order.
    strategy: STRATEGIES.includes(settings?.strategy) ? settings.strategy : 'list-order',
    skipped: [], // REQ-NAV-011
    trail: [], // visited-clue breadcrumbs for "back" under most-filled (REQ-NAV-009)
    mode: 'normal',
    spellBuffer: [],
    disambigWords: [],
    pendingWord: null,
    pendingEntry: null,
    lastEntry: null,
    rejected: [],
    lastProposed: null,
    undoSay: null,
    pendingCorrection: null,
    sttRetried: false,
    celebrated: false,
    missStreak: 0, // REQ-SPCH-011: consecutive failed answer attempts on the current entry
    resetStreak: 0, // REQ-SPCH-012: consecutive mid-utterance resets (background-talk signature)
    noiseHinted: false, // REQ-SPCH-012: the background-noise hint plays at most once a session
    endReason: null, // REQ-DIAG-002: why a terminal say ends the session, for the END action
  };
  const actions = [];
  if (clueId !== selected) actions.push({ type: 'SELECT_CLUE', clueId });
  if (model.isFull()) actions.push(say({ kind: 'grid-full-wrong' })); // REQ-LIFE-006 at start
  actions.push(say(clueSay(model, clueId, { greeting: true }))); // REQ-LIFE-010
  return { state: s, actions };
}

function onTtsDone(state) {
  if (state.phase !== 'speaking') return { state, actions: [] };
  if (state.after === 'end') {
    // REQ-DIAG-002: the terminal say set endReason when it chose to end the session.
    return { state: { ...state, phase: 'done' }, actions: [{ type: 'END', reason: state.endReason ?? 'done' }] };
  }
  if (state.after === 'enter') {
    const word = state.pendingEntry.word;
    // REQ-ANS-019: crossings that lose a letter to this write are malformed — their
    // surviving letters ride the same ENTER as pencil rewrites.
    const penciled = state.model.pencilPlanFor(state.clueId, word);
    // REQ-ANS-025: in pencil mode the word itself lands penciled. Pen-mode cells carry
    // no flag at all — the writer types them in the page's current mode (pen).
    const wordCells = state.writeMode === 'pencil'
      ? state.model.cellsForWord(state.clueId, word).map((c) => ({ ...c, pencil: true }))
      : state.model.cellsForWord(state.clueId, word);
    return {
      // Remember what the entry held BEFORE this write, so "undo" can revert it
      // exactly — clearing what we added, restoring what we overwrote (REQ-ANS-017),
      // with its pencil state, and un-softening what we penciled (REQ-ANS-019).
      state: {
        ...state,
        phase: 'entering',
        lastEntry: {
          clueId: state.clueId,
          before: state.model.patternFor(state.clueId),
          beforePencil: state.model.pencilFor(state.clueId),
          penciled,
          wordCells, // ledger upkeep needs the letters AND their pencil flags
          softBefore: state.softCells, // ledger to restore on undo (REQ-ANS-023)
        },
      },
      actions: [{
        type: 'ENTER',
        clueId: state.clueId,
        word,
        cells: [
          ...wordCells,
          ...penciled.map((c) => ({ ...c, pencil: true })),
        ],
      }],
    };
  }
  return { state: { ...state, phase: 'listening' }, actions: [{ type: 'LISTEN' }] };
}

// REQ-SPCH-012: this many resets in a row read as continuous background talk, not a
// slow speller — the recognizer keeps hearing speech it can never finalize.
export const RESET_STORM = 3;

function onSttError(state, { code, silentMs }) {
  if (state.phase !== 'listening') return { state, actions: [] };
  if (code === 'aborted') return { state, actions: [] };
  if (code === 'reset') {
    // REQ-SPCH-010: the port dropped a half-heard utterance after a mid-answer pause.
    // Reopen the mic right away — the fresh LISTEN's ready ping tells the user they
    // are starting from scratch.
    const resetStreak = (state.resetStreak ?? 0) + 1;
    if (resetStreak >= RESET_STORM && !state.noiseHinted) {
      // REQ-SPCH-012: a reset storm is the one failure the user can't see — name it, once.
      return listenAgain(
        { ...state, resetStreak, noiseHinted: true },
        [{ kind: 'noise-hint' }],
      );
    }
    return { state: { ...state, phase: 'listening', resetStreak }, actions: [{ type: 'LISTEN' }] };
  }
  if (code === 'not-allowed') { // REQ-SPCH-003
    return speak({ ...state, endReason: 'mic-denied' }, [say({ kind: 'mic-denied' })], 'end');
  }
  if (code === 'no-speech') { // REQ-CMD-005: never nag about silence
    if ((silentMs ?? 0) >= SILENCE_TIMEOUT_MS) {
      // Enough quiet — just stop listening, as silently as the icon toggle.
      return { state: { ...state, phase: 'done' }, actions: [{ type: 'END', reason: 'silence' }] };
    }
    // A silent cycle between resets means the background talk stopped — a genuine storm
    // (REQ-SPCH-012) is back-to-back resets, so the consecutive count starts over here.
    return { state: { ...state, phase: 'listening', resetStreak: 0 }, actions: [{ type: 'LISTEN' }] };
  }
  // network / audio-capture / other: retry once (REQ-SPCH-004)
  if (!state.sttRetried) {
    return listenAgain({ ...state, sttRetried: true }, [{ kind: 'stt-error', final: false }]);
  }
  return speak({ ...state, endReason: 'stt-error' }, [say({ kind: 'stt-error', final: true })], 'end');
}

function onEntryResult(state, { ok, snapshot }) {
  if (state.phase !== 'entering') return { state, actions: [] };
  // Ledger upkeep (REQ-ANS-023): the word's cells landed in whatever mode the ENTER
  // asked for (pen drops any stale soft record, pencil-mode words ARE soft records,
  // REQ-ANS-025), and the plan's cells were just penciled — remember all of it
  // ourselves, since the page can't tell us (REQ-PAGE-012).
  let softCells = state.softCells ?? {};
  if (ok && state.lastEntry) {
    softCells = { ...softCells };
    for (const { index, letter, pencil } of state.lastEntry.wordCells ?? []) {
      if (pencil) softCells[index] = letter;
      else delete softCells[index];
    }
    for (const { index, letter } of state.lastEntry.penciled) softCells[index] = letter;
  }
  const model = buildModel(snapshot, { softCells });
  let s = { ...state, model, softCells, pendingEntry: null, pendingWord: null, mode: 'normal' };
  if (!ok) return listenAgain(s, [{ kind: 'entry-failed' }]); // REQ-ANS-013
  // The proposal is an entry now: from here "you misheard" means undo it (REQ-ANS-010).
  s = { ...s, lastProposed: null };
  if (model.isSolved() && !s.celebrated) { // REQ-LIFE-005
    return speak({ ...s, celebrated: true, endReason: 'win' }, [say({ kind: 'celebration' })], 'end');
  }
  if (model.isFull()) {
    // REQ-LIFE-006 + REQ-NAV-014: full but wrong — say so, and when penciled letters
    // exist, land straight on the first suspect entry instead of staying put.
    const suspect = nextPencilled(model, s.clueId);
    if (suspect) {
      const s2 = moveTo(leaveCrumb(s), suspect);
      return speak(s2, [
        say({ kind: 'grid-full-wrong' }),
        { type: 'SELECT_CLUE', clueId: suspect },
        say(clueSay(s2.model, suspect)),
      ], 'listen');
    }
    return listenAgain(s, [{ kind: 'grid-full-wrong' }]);
  }
  return advance(s);
}

function onPageEvent(state, { kind, snapshot }) {
  if (state.phase === 'idle' || state.phase === 'done') return { state, actions: [] };
  if (kind === 'solved') {
    if (state.celebrated) return { state, actions: [] };
    return speak(
      { ...state, celebrated: true, endReason: 'win', model: remodel(state, snapshot) },
      [say({ kind: 'celebration' })],
      'end',
    );
  }
  // REQ-NAV-008: a click reaches us while listening AND mid-readout (the shell cuts the
  // audio short). Off-limits: entering, the farewell, and the beat between an accepted
  // answer and its letters landing (after:'enter') — following there would silently
  // discard the answer.
  const interactive = state.phase === 'listening'
    || (state.phase === 'speaking' && state.after === 'listen');
  if (!interactive) return { state, actions: [] };
  const model = remodel(state, snapshot);
  if (kind === 'selection') {
    const sel = snapshot.selection?.clueId;
    if (sel && sel !== state.clueId && model.clue(sel)) {
      // The click wins over whatever was in progress: reset any sub-mode and pending
      // work. It leaves a breadcrumb like any forward navigation (REQ-NAV-009).
      return readClue({ ...moveTo(leaveCrumb(state), sel), model });
    }
  }
  // Grid change (user typed manually) or same-clue selection: absorb the fresh state.
  // The shell must NOT have stopped the mic for an absorbed event (see the orchestrator's
  // enqueue) — stopping it here with no follow-up LISTEN would leave the session deaf
  // while the badge still says ON.
  return { state: { ...state, model }, actions: [] };
}

// REQ-ANS-017: the page finished reverting our last entry.
function onUndoResult(state, { ok, snapshot }) {
  if (state.phase !== 'undoing') return { state, actions: [] };
  const { undoSay, pendingCorrection } = state;
  const s = { ...state, model: remodel(state, snapshot), undoSay: null, pendingCorrection: null };
  if (!ok) return listenAgain(s, [{ kind: 'entry-failed' }]);
  // The revert writes cell by cell, and those clicks leave the page's cursor wherever
  // they ended — often on a CROSSING clue. Reassert the undone clue so the page's
  // selection matches the conversation again (REQ-ANS-017: undo restores the cursor).
  const reselect = { type: 'SELECT_CLUE', clueId: s.clueId };
  if (pendingCorrection) { // "no, I said X" across an entry: revert landed, now try X here
    const evaluated = evaluateAnswer(s, [{ transcript: pendingCorrection }]);
    if (evaluated) return { ...evaluated, actions: [reselect, ...evaluated.actions] };
    return speak(s, [reselect, say({ kind: 'didnt-catch' })], 'listen');
  }
  if (undoSay === 'undone') {
    // A plain undo re-orients the user: confirm, then reread the clue they are back on.
    return readClue(s, {}, [reselect, say({ kind: 'undone' })]);
  }
  return speak(s, [reselect, say({ kind: undoSay ?? 'undone' })], 'listen');
}

// REQ-CMD-006: "stop" heard by the barge-in listener while we were speaking.
function onBargeIn(state) {
  if (state.phase !== 'speaking') return { state, actions: [] };
  if (state.after === 'end') { // stop during the sign-off itself — just go
    return {
      state: { ...state, phase: 'done' },
      actions: [{ type: 'END', reason: state.endReason ?? 'goodbye' }],
    };
  }
  return speak({ ...state, endReason: 'goodbye' }, [say({ kind: 'goodbye' })], 'end'); // REQ-CMD-004
}

function onHeard(state, { alternatives }) {
  // Listening, or barge-in during an utterance that ends in listening (REQ-SPCH-009).
  // Not while an entry is pending (after:'enter') or during the sign-off.
  const receptive = state.phase === 'listening'
    || (state.phase === 'speaking' && state.after === 'listen');
  if (!receptive) return { state, actions: [] };
  // A successful hearing clears the retry flag and the reset streak (REQ-SPCH-012).
  const s = { ...state, sttRetried: false, resetStreak: 0 };
  if (!alternatives?.length) {
    return listenAgain(missed(s), [{ kind: 'didnt-catch' }]);
  }
  switch (s.mode) {
    case 'spelling': return onHeardSpelling(s, alternatives);
    case 'disambiguating': return onHeardDisambig(s, alternatives);
    case 'confirm-replace': return onHeardConfirm(s, alternatives);
    case 'goto-number': return onHeardGotoNumber(s, alternatives);
    default: return onHeardNormal(s, alternatives);
  }
}

export function reduce(state, event) {
  switch (event.type) {
    case 'START': return onStart(state, event);
    case 'TTS_DONE': return onTtsDone(state);
    case 'HEARD': return onHeard(state, event);
    case 'BARGE_IN': return onBargeIn(state);
    case 'STT_ERROR': return onSttError(state, event);
    case 'ENTRY_RESULT': return onEntryResult(state, event);
    case 'UNDO_RESULT': return onUndoResult(state, event);
    case 'PAGE_EVENT': return onPageEvent(state, event);
    case 'TOGGLE_OFF': // REQ-LIFE-002: instant, silent teardown
      return {
        state: { ...state, phase: 'done' },
        // REQ-DIAG-002: the shell says why it toggled off (user stop, NYT pause, page lost).
        actions: [{ type: 'END', reason: event.reason ?? 'user' }],
      };
    default:
      return { state, actions: [] };
  }
}
