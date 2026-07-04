// Conversation policy: pure reducer (state, event) → {state, actions}.
// No browser APIs, no English strings (see phrases.js), no DOM (see page-adapter).
//
// Events in:  START TTS_DONE HEARD STT_ERROR ENTRY_RESULT PAGE_EVENT TOGGLE_OFF
// Actions out: SAY LISTEN ENTER SELECT_CLUE END
//
// Half-duplex invariant (REQ-SPCH-005): LISTEN is never emitted in the same action
// batch as SAY; listening starts only after speech finishes (TTS_DONE → after:'listen').

import { buildModel } from '../puzzle-model/model.js';
import { nextClue } from './strategies.js';
import { evaluate, collectSpelledLetters } from '../matching/evaluate.js';
import { parseCommand } from '../matching/commands.js';

export function initialState() {
  return { phase: 'idle' };
}

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

function advance(state, leadSays = []) {
  const next = nextClue(state.model, state.clueId, state.strategy);
  if (!next) {
    // Nothing unfilled anywhere (REQ-LIFE-006 / REQ-NAV-003).
    return listenAgain(state, [...leadSays, { kind: 'grid-full-wrong' }]);
  }
  const s = {
    ...state,
    clueId: next.clueId,
    mode: 'normal',
    rejected: [],
    lastProposed: null,
    pendingWord: null,
    spellBuffer: [],
    disambigWords: [],
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
      return advance(state);
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
    case 'spell':
      return listenAgain(
        { ...state, mode: 'spelling', spellBuffer: [] },
        [{ kind: 'spell-start' }],
      );
    case 'enter-anyway': // REQ-ANS-012
      if (!state.pendingWord) return listenAgain(state, [{ kind: 'didnt-catch' }]);
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
  const word = buffer.join('');
  const rawPattern = state.model.patternFor(state.clueId);
  const pattern = state.model.wordFor(state.clueId) ? rawPattern.map(() => null) : rawPattern;
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
  return listenAgain(state, [{
    kind: 'length-mismatch',
    variants: [{ word, len: word.length }],
    needed: pattern.length,
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
  if (cmd?.command === 'yes' && state.pendingWord) {
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

function onStart(state, { snapshot }) {
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
    strategy: 'list-order',
    mode: 'normal',
    spellBuffer: [],
    disambigWords: [],
    pendingWord: null,
    pendingEntry: null,
    rejected: [],
    lastProposed: null,
    silence: 0,
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
    return {
      state: { ...state, phase: 'entering' },
      actions: [{
        type: 'ENTER',
        clueId: state.clueId,
        word,
        cells: state.model.cellsForWord(state.clueId, word),
      }],
    };
  }
  return { state: { ...state, phase: 'listening' }, actions: [{ type: 'LISTEN' }] };
}

function onSttError(state, { code }) {
  if (state.phase !== 'listening') return { state, actions: [] };
  if (code === 'aborted') return { state, actions: [] };
  if (code === 'not-allowed') { // REQ-SPCH-003
    return speak(state, [say({ kind: 'mic-denied' })], 'end');
  }
  if (code === 'no-speech') { // REQ-CMD-005 silence ladder
    const silence = state.silence + 1;
    const s = { ...state, silence };
    if (silence === 1) return listenAgain(s, [{ kind: 'silence-reprompt' }]);
    if (silence === 2) return listenAgain(s, [{ kind: 'waiting-note' }]);
    if (silence <= 4) return { state: { ...s, phase: 'listening' }, actions: [{ type: 'LISTEN' }] };
    return speak(s, [say({ kind: 'goodbye-idle' })], 'end');
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
  if (state.phase !== 'listening') return { state, actions: [] };
  const model = buildModel(snapshot);
  if (kind === 'selection' && state.mode === 'normal') { // REQ-NAV-008
    const sel = snapshot.selection?.clueId;
    if (sel && sel !== state.clueId && model.clue(sel)) {
      return readClue({
        ...state, model, clueId: sel, rejected: [], lastProposed: null, pendingWord: null,
      });
    }
  }
  // grid change (user typed manually) or same-clue selection: absorb the fresh state.
  return { state: { ...state, model }, actions: [] };
}

function onHeard(state, { alternatives }) {
  if (state.phase !== 'listening') return { state, actions: [] };
  const s = { ...state, silence: 0, sttRetried: false };
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
    case 'STT_ERROR': return onSttError(state, event);
    case 'ENTRY_RESULT': return onEntryResult(state, event);
    case 'PAGE_EVENT': return onPageEvent(state, event);
    case 'TOGGLE_OFF': // REQ-LIFE-002: instant, silent teardown
      return { state: { ...state, phase: 'done' }, actions: [{ type: 'END' }] };
    default:
      return { state, actions: [] };
  }
}
