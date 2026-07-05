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
import { parseCommand } from '../matching/commands.js';

export function initialState() {
  return { phase: 'idle' };
}

// REQ-CMD-005: how long we listen without hearing anything before quietly stopping.
// This is a thinking game — pauses are normal, so nothing is ever said about silence.
export const SILENCE_TIMEOUT_MS = 60_000;

const say = (payload) => ({ type: 'SAY', say: payload });
const CONTEXTUAL = new Set(['yes', 'no', 'choice']);

function clueSay(model, clueId, extra = {}) {
  const clue = model.clue(clueId);
  return {
    kind: 'clue',
    label: clue.label,
    runs: clue.runs,
    answerLength: clue.cellIndices.length,
    ...extra,
  };
}

/** Transition into speaking; `after` = what TTS_DONE should do: 'listen' | 'end' | 'enter'. */
function speak(state, actions, after) {
  return { state: { ...state, phase: 'speaking', after }, actions };
}

function listenAgain(state, sayPayloads) {
  return speak(state, sayPayloads.map(say), 'listen');
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
  };
}

/** Navigate to a clue, sync the page, and read it (back/flip — REQ-NAV-009/010). */
function goTo(state, clueId) {
  const s = moveTo(state, clueId);
  return speak(s, [
    { type: 'SELECT_CLUE', clueId },
    say(clueSay(s.model, clueId)),
  ], 'listen');
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

function advance(state, leadSays = []) {
  const skipped = liveSkips(state);
  const next = nextClue(state.model, state.clueId, state.strategy, skipped.map((e) => e.clueId));
  if (!next) {
    // Nothing unfilled anywhere (REQ-LIFE-006 / REQ-NAV-003).
    return listenAgain({ ...state, skipped }, [...leadSays, { kind: 'grid-full-wrong' }]);
  }
  // Landing on a clue clears its skip record — skipping it again re-files it as newest.
  const s = {
    ...moveTo(state, next.clueId),
    skipped: skipped.filter((e) => e.clueId !== next.clueId),
  };
  return speak(s, [
    ...leadSays.map(say),
    { type: 'SELECT_CLUE', clueId: next.clueId },
    say(clueSay(s.model, s.clueId, { wrapped: next.wrapped })),
  ], 'listen');
}

/** Accept a fitting word: replace-confirmation when overwriting (REQ-ANS-016), else enter. */
function finishFit(state, word, spelledDifferently) {
  const current = state.model.wordFor(state.clueId);
  if (current && current !== word) {
    return listenAgain(
      { ...state, mode: 'confirm-replace', pendingWord: word, spellBuffer: [] },
      [{ kind: 'replace-confirm', word, current }],
    );
  }
  return speak(
    { ...state, mode: 'normal', pendingWord: word, lastProposed: word, pendingEntry: { word }, spellBuffer: [] },
    [say({ kind: 'fit', word, spelledDifferently })],
    'enter',
  );
}

function evaluateAnswer(state, alternatives) {
  const rawPattern = state.model.patternFor(state.clueId);
  // Fully filled entry: its letters are what a new answer would REPLACE, so only the
  // length gate applies — collisions are for partially filled entries (REQ-ANS-016).
  const pattern = state.model.wordFor(state.clueId) ? rawPattern.map(() => null) : rawPattern;
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
      return listenAgain(
        { ...state, lastProposed: outcome.variants[0].word },
        [{ kind: 'length-mismatch', variants: outcome.variants, needed: outcome.needed }],
      );
    default:
      return null; // unintelligible — caller picks the fallback
  }
}

function handleCommand(state, cmd) {
  switch (cmd.command) {
    case 'next':
      return advance(recordSkip(state)); // REQ-NAV-011: an explicit skip is remembered
    case 'back': // REQ-NAV-009: previous in list order, filled entries included
      return goTo(state, prevClue(state.model, state.clueId).clueId);
    case 'flip': { // REQ-NAV-010: jump to the crossing clue
      const clue = state.model.clue(state.clueId);
      let cross = null;
      for (let i = 0; i < clue.cellIndices.length && !cross; i++) {
        cross = state.model.crossingAt(state.clueId, i);
      }
      if (!cross) return listenAgain(state, [{ kind: 'no-crossing' }]);
      return goTo(state, cross.clueId);
    }
    case 'undo': { // REQ-ANS-017: revert the last entry we made
      if (!state.lastEntry) return listenAgain(state, [{ kind: 'nothing-to-undo' }]);
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
        state: { ...moveTo(state, clueId), phase: 'undoing', lastEntry: null },
        actions: [
          { type: 'SELECT_CLUE', clueId },
          { type: 'UNDO', clueId, cells },
        ],
      };
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
      return speak(state, [say({ kind: 'goodbye' })], 'end'); // REQ-CMD-004
    case 'spell': {
      // REQ-ANS-018: the opening prompt offers the just-the-open-squares option.
      const pattern = state.model.patternFor(state.clueId);
      return listenAgain(
        { ...state, mode: 'spelling', spellBuffer: [] },
        [{ kind: 'spell-start', open: pattern.filter((l) => !l).length, length: pattern.length }],
      );
    }
    case 'enter-anyway': // REQ-ANS-012
      if (!state.pendingWord) return null; // nothing pending — ANYWAY might be the answer
      return speak(
        { ...state, mode: 'normal', pendingEntry: { word: state.pendingWord } },
        [say({ kind: 'entering-anyway', word: state.pendingWord })],
        'enter',
      );
    case 'misheard': { // REQ-ANS-010
      if (cmd.arg) {
        return evaluateAnswer(state, [{ transcript: cmd.arg }])
          ?? listenAgain(state, [{ kind: 'didnt-catch' }]);
      }
      const rejected = state.lastProposed
        ? [...state.rejected, state.lastProposed]
        : state.rejected;
      return listenAgain({ ...state, rejected, pendingWord: null }, [{ kind: 'misheard-reprompt' }]);
    }
    case 'strategy': // REQ-NAV-005
      return listenAgain({ ...state, strategy: cmd.arg }, [{ kind: 'strategy-ack', strategy: cmd.arg }]);
    case 'answer': // REQ-ANS-014
      return evaluateAnswer(state, [{ transcript: cmd.arg }])
        ?? listenAgain(state, [{ kind: 'didnt-catch' }]);
    default:
      return null;
  }
}

function finishSpelling(state, buffer) {
  const rawPattern = state.model.patternFor(state.clueId);
  const pattern = state.model.wordFor(state.clueId) ? rawPattern.map(() => null) : rawPattern;
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
  if (cmd?.command === 'stop') return speak(state, [say({ kind: 'goodbye' })], 'end');
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
  return listenAgain(state, [{ kind: 'didnt-catch' }]); // REQ-CMD-003
}

function onStart(state, { snapshot, settings }) {
  if (snapshot.status === 'not-found') {
    return speak({ ...state, phase: 'speaking' }, [say({ kind: 'no-puzzle' })], 'end'); // REQ-LIFE-003
  }
  if (snapshot.status === 'solved') {
    return speak({ ...state, phase: 'speaking' }, [say({ kind: 'already-solved' })], 'end'); // REQ-LIFE-004
  }
  const model = buildModel(snapshot);
  const selected = snapshot.selection?.clueId;
  const clueId = (selected && model.clue(selected)) ? selected : model.firstUnfilled(); // REQ-LIFE-007
  const s = {
    phase: 'speaking',
    after: 'listen',
    model,
    clueId,
    // REQ-NAV-012: the persisted setting seeds the strategy; anything unrecognized
    // (corrupt storage, older versions) falls back to list order.
    strategy: STRATEGIES.includes(settings?.strategy) ? settings.strategy : 'list-order',
    skipped: [], // REQ-NAV-011
    mode: 'normal',
    spellBuffer: [],
    disambigWords: [],
    pendingWord: null,
    pendingEntry: null,
    lastEntry: null,
    rejected: [],
    lastProposed: null,
    sttRetried: false,
    celebrated: false,
  };
  const actions = [];
  if (clueId !== selected) actions.push({ type: 'SELECT_CLUE', clueId });
  if (model.isFull()) actions.push(say({ kind: 'grid-full-wrong' })); // REQ-LIFE-006 at start
  actions.push(say(clueSay(model, clueId, { greeting: true }))); // REQ-LIFE-010
  return { state: s, actions };
}

function onTtsDone(state) {
  if (state.phase !== 'speaking') return { state, actions: [] };
  if (state.after === 'end') return { state: { ...state, phase: 'done' }, actions: [{ type: 'END' }] };
  if (state.after === 'enter') {
    const word = state.pendingEntry.word;
    // REQ-ANS-019: crossings that lose a letter to this write are malformed — their
    // surviving letters ride the same ENTER as pencil rewrites.
    const penciled = state.model.pencilPlanFor(state.clueId, word);
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
        },
      },
      actions: [{
        type: 'ENTER',
        clueId: state.clueId,
        word,
        cells: [
          ...state.model.cellsForWord(state.clueId, word),
          ...penciled.map((c) => ({ ...c, pencil: true })),
        ],
      }],
    };
  }
  return { state: { ...state, phase: 'listening' }, actions: [{ type: 'LISTEN' }] };
}

function onSttError(state, { code, silentMs }) {
  if (state.phase !== 'listening') return { state, actions: [] };
  if (code === 'aborted') return { state, actions: [] };
  if (code === 'not-allowed') { // REQ-SPCH-003
    return speak(state, [say({ kind: 'mic-denied' })], 'end');
  }
  if (code === 'no-speech') { // REQ-CMD-005: never nag about silence
    if ((silentMs ?? 0) >= SILENCE_TIMEOUT_MS) {
      // Enough quiet — just stop listening, as silently as the icon toggle.
      return { state: { ...state, phase: 'done' }, actions: [{ type: 'END' }] };
    }
    return { state: { ...state, phase: 'listening' }, actions: [{ type: 'LISTEN' }] };
  }
  // network / audio-capture / other: retry once (REQ-SPCH-004)
  if (!state.sttRetried) {
    return listenAgain({ ...state, sttRetried: true }, [{ kind: 'stt-error', final: false }]);
  }
  return speak(state, [say({ kind: 'stt-error', final: true })], 'end');
}

function onEntryResult(state, { ok, snapshot }) {
  if (state.phase !== 'entering') return { state, actions: [] };
  const model = buildModel(snapshot);
  const s = { ...state, model, pendingEntry: null, pendingWord: null, mode: 'normal' };
  if (!ok) return listenAgain(s, [{ kind: 'entry-failed' }]); // REQ-ANS-013
  if (model.isSolved() && !s.celebrated) { // REQ-LIFE-005
    return speak({ ...s, celebrated: true }, [say({ kind: 'celebration' })], 'end');
  }
  if (model.isFull()) return listenAgain(s, [{ kind: 'grid-full-wrong' }]); // REQ-LIFE-006
  return advance(s);
}

function onPageEvent(state, { kind, snapshot }) {
  if (state.phase === 'idle' || state.phase === 'done') return { state, actions: [] };
  if (kind === 'solved') {
    if (state.celebrated) return { state, actions: [] };
    return speak(
      { ...state, celebrated: true, model: buildModel(snapshot) },
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
  const model = buildModel(snapshot);
  if (kind === 'selection') {
    const sel = snapshot.selection?.clueId;
    if (sel && sel !== state.clueId && model.clue(sel)) {
      // The click wins over whatever was in progress: reset any sub-mode and pending work.
      return readClue({ ...moveTo(state, sel), model });
    }
  }
  // grid change (user typed manually) or same-clue selection: absorb the fresh state.
  return { state: { ...state, model }, actions: [] };
}

// REQ-ANS-017: the page finished reverting our last entry.
function onUndoResult(state, { ok, snapshot }) {
  if (state.phase !== 'undoing') return { state, actions: [] };
  const s = { ...state, model: buildModel(snapshot) };
  if (!ok) return listenAgain(s, [{ kind: 'entry-failed' }]);
  return listenAgain(s, [{ kind: 'undone' }]); // prompt: say it again, or spell it
}

// REQ-CMD-006: "stop" heard by the barge-in listener while we were speaking.
function onBargeIn(state) {
  if (state.phase !== 'speaking') return { state, actions: [] };
  if (state.after === 'end') { // stop during the sign-off itself — just go
    return { state: { ...state, phase: 'done' }, actions: [{ type: 'END' }] };
  }
  return speak(state, [say({ kind: 'goodbye' })], 'end'); // REQ-CMD-004
}

function onHeard(state, { alternatives }) {
  // Listening, or barge-in during an utterance that ends in listening (REQ-SPCH-009).
  // Not while an entry is pending (after:'enter') or during the sign-off.
  const receptive = state.phase === 'listening'
    || (state.phase === 'speaking' && state.after === 'listen');
  if (!receptive) return { state, actions: [] };
  const s = { ...state, sttRetried: false };
  if (!alternatives?.length) return listenAgain(s, [{ kind: 'didnt-catch' }]);
  switch (s.mode) {
    case 'spelling': return onHeardSpelling(s, alternatives);
    case 'disambiguating': return onHeardDisambig(s, alternatives);
    case 'confirm-replace': return onHeardConfirm(s, alternatives);
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
      return { state: { ...state, phase: 'done' }, actions: [{ type: 'END' }] };
    default:
      return { state, actions: [] };
  }
}
