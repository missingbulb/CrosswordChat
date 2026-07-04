import { describe, test, expect } from 'vitest';
import { initialState, reduce, SILENCE_TIMEOUT_MS } from '../../extension/src/conversation/machine.js';
import { heartSnapshot, makeSnapshot, SOLVED_HEART_ROWS } from '../helpers/snapshots.js';

// Every action batch from every scenario is collected so the half-duplex invariant
// (REQ-SPCH-005) is asserted across the whole suite, not one cherry-picked flow.
const allBatches = [];

function scenario() {
  let state = initialState();
  const step = (event) => {
    const result = reduce(state, event);
    state = result.state;
    allBatches.push(result.actions);
    return result.actions;
  };
  return { step, state: () => state };
}

const heard = (transcript) => ({ type: 'HEARD', alternatives: [{ transcript, confidence: 0.9 }] });
const says = (actions) => actions.filter((a) => a.type === 'SAY').map((a) => a.say);
const types = (actions) => actions.map((a) => a.type);

/** START + first TTS_DONE → phase 'listening'. */
function listening(snap) {
  const s = scenario();
  s.step({ type: 'START', snapshot: snap });
  s.step({ type: 'TTS_DONE' });
  return s;
}

describe('session start (LIFE)', () => {
  test('REQ-LIFE-001/REQ-LIFE-007/REQ-LIFE-010: start reads the highlighted clue, one SAY, then listens', () => {
    const s = scenario();
    const actions = s.step({
      type: 'START',
      snapshot: heartSnapshot(undefined, { selection: { clueId: 'D3' } }),
    });
    const sayList = says(actions);
    expect(sayList).toHaveLength(1); // REQ-LIFE-010: no tutorial monologue
    expect(sayList[0].kind).toBe('clue');
    expect(sayList[0].label).toBe('3 Down');
    expect(sayList[0].greeting).toBe(true);
    expect(types(actions)).not.toContain('SELECT_CLUE'); // page already there
    expect(types(s.step({ type: 'TTS_DONE' }))).toEqual(['LISTEN']);
  });

  test('REQ-LIFE-007: no page selection → first unfilled clue, page synced', () => {
    const s = scenario();
    const actions = s.step({
      type: 'START',
      snapshot: heartSnapshot(['HEART', '.....', '.....', '.....', '.....']),
    });
    expect(actions.find((a) => a.type === 'SELECT_CLUE')?.clueId).toBe('A6');
    expect(says(actions)[0].label).toBe('6 Across');
  });

  test('REQ-LIFE-003: no puzzle → say so and end, never listen', () => {
    const s = scenario();
    const start = s.step({ type: 'START', snapshot: { status: 'not-found', size: { rows: 0, cols: 0 }, cells: [], clues: [], selection: {} } });
    expect(says(start)[0].kind).toBe('no-puzzle');
    expect(types(s.step({ type: 'TTS_DONE' }))).toEqual(['END']);
  });

  test('REQ-LIFE-004: already solved → celebrate once and end, mic never opens', () => {
    const s = scenario();
    const start = s.step({ type: 'START', snapshot: heartSnapshot(SOLVED_HEART_ROWS, { status: 'solved' }) });
    expect(says(start)[0].kind).toBe('already-solved');
    const end = s.step({ type: 'TTS_DONE' });
    expect(types(end)).toEqual(['END']);
    expect(types(start).concat(types(end))).not.toContain('LISTEN');
  });

  test('REQ-LIFE-006: grid full but wrong at start → discrepancy noted, session continues', () => {
    const s = scenario();
    const actions = s.step({ type: 'START', snapshot: heartSnapshot(['HEARX', 'EMBER', 'ABUSE', 'RESIN', 'TREND']) });
    const kinds = says(actions).map((x) => x.kind);
    expect(kinds).toEqual(['grid-full-wrong', 'clue']);
    expect(types(s.step({ type: 'TTS_DONE' }))).toEqual(['LISTEN']); // still conversing
  });

  test('REQ-LIFE-002: icon toggle ends instantly and silently from any phase', () => {
    const s = listening(heartSnapshot(undefined, { selection: { clueId: 'A1' } }));
    const actions = s.step({ type: 'TOGGLE_OFF' });
    expect(actions).toEqual([{ type: 'END' }]); // no goodbye SAY — silence is the spec
  });
});

describe('navigation (NAV)', () => {
  test('REQ-NAV-001/REQ-NAV-002: "pass" advances in list order without entering anything', () => {
    const s = listening(heartSnapshot(undefined, { selection: { clueId: 'A1' } }));
    const actions = s.step(heard('pass'));
    expect(types(actions)).toEqual(['SELECT_CLUE', 'SAY']); // REQ-NAV-007: page follows
    expect(actions[0].clueId).toBe('A6');
    expect(says(actions)[0].label).toBe('6 Across');
    expect(types(actions)).not.toContain('ENTER');
  });

  test('REQ-NAV-006: wrap-around is flagged for the readout', () => {
    const snap = heartSnapshot(['.....', 'EMBER', 'ABUSE', 'RESIN', 'TREND'], { selection: { clueId: 'D5' } });
    const s = listening(snap);
    const actions = s.step(heard('next'));
    expect(actions.find((a) => a.type === 'SELECT_CLUE').clueId).toBe('A1');
    expect(says(actions)[0].wrapped).toBe(true);
  });

  test('REQ-NAV-005/REQ-NAV-004: switching strategy by voice changes what "next" does', () => {
    const snap = heartSnapshot(['.....', 'EMBER', 'ABUSE', 'RESIN', 'TREND'], { selection: { clueId: 'A1' } });
    const s = listening(snap);
    const ack = s.step(heard('switch to most filled'));
    expect(says(ack)[0]).toEqual({ kind: 'strategy-ack', strategy: 'most-filled' });
    s.step({ type: 'TTS_DONE' });
    const nav = s.step(heard('next'));
    expect(nav.find((a) => a.type === 'SELECT_CLUE').clueId).toBe('D1'); // 4/5 filled beats empty A1
  });

  test('REQ-NAV-008: conversation follows a manual clue click, ignores echoes', () => {
    const s = listening(heartSnapshot(undefined, { selection: { clueId: 'A1' } }));
    const snap2 = heartSnapshot(undefined, { selection: { clueId: 'D2' } });
    const actions = s.step({ type: 'PAGE_EVENT', kind: 'selection', snapshot: snap2 });
    expect(says(actions)[0].label).toBe('2 Down');
    s.step({ type: 'TTS_DONE' });
    // Same clue again (e.g. our own SELECT echoing back) → no re-read.
    expect(s.step({ type: 'PAGE_EVENT', kind: 'selection', snapshot: snap2 })).toEqual([]);
  });

  test('REQ-NAV-008: a click mid-readout switches clues (the shell cuts the audio short)', () => {
    const s = scenario();
    s.step({ type: 'START', snapshot: heartSnapshot(undefined, { selection: { clueId: 'A1' } }) });
    // Still speaking the opening readout when the user clicks 2 Down.
    const actions = s.step({
      type: 'PAGE_EVENT',
      kind: 'selection',
      snapshot: heartSnapshot(undefined, { selection: { clueId: 'D2' } }),
    });
    expect(says(actions)[0].label).toBe('2 Down');
    expect(types(s.step({ type: 'TTS_DONE' }))).toEqual(['LISTEN']);
  });

  test('REQ-NAV-009: "back" goes to the previous clue in list order, filled ones included', () => {
    // A1 is filled — "next" would skip it, but "back" exists to revisit and fix.
    const s = listening(heartSnapshot(['HEART', '.....', '.....', '.....', '.....'], { selection: { clueId: 'A6' } }));
    const actions = s.step(heard('back'));
    expect(actions.find((a) => a.type === 'SELECT_CLUE').clueId).toBe('A1');
    expect(says(actions)[0].label).toBe('1 Across');
    s.step({ type: 'TTS_DONE' });

    // From the very first clue, "back" wraps to the last Down.
    const first = s.step(heard('back'));
    expect(first.find((a) => a.type === 'SELECT_CLUE').clueId).toBe('D5');
    expect(says(first)[0].label).toBe('5 Down');
  });

  test('REQ-NAV-010: "flip" switches to the crossing clue', () => {
    const s = listening(heartSnapshot(undefined, { selection: { clueId: 'A1' } }));
    const actions = s.step(heard('flip'));
    expect(actions.find((a) => a.type === 'SELECT_CLUE').clueId).toBe('D1');
    expect(says(actions)[0].label).toBe('1 Down');
    s.step({ type: 'TTS_DONE' });
    // Flip again → back to an Across at that spot.
    expect(says(s.step(heard('flip')))[0].label).toBe('1 Across');
  });

  test('REQ-NAV-008: a click during spelling mode abandons the mode and follows', () => {
    const s = listening(heartSnapshot(undefined, { selection: { clueId: 'A1' } }));
    s.step(heard('spell'));
    s.step({ type: 'TTS_DONE' });
    const actions = s.step({
      type: 'PAGE_EVENT',
      kind: 'selection',
      snapshot: heartSnapshot(undefined, { selection: { clueId: 'D2' } }),
    });
    expect(says(actions)[0].label).toBe('2 Down');
    s.step({ type: 'TTS_DONE' });
    // A whole word is accepted again — spelling mode is gone.
    expect(says(s.step(heard('ember')))[0].kind).toBe('fit');
  });
});

describe('answers (ANS)', () => {
  test('REQ-ANS-006: fit → announce → enter → advance → read next (REQ-SPCH-005 ordering)', () => {
    const s = listening(heartSnapshot(undefined, { selection: { clueId: 'A1' } }));
    const fit = s.step(heard('heart'));
    expect(says(fit)[0]).toMatchObject({ kind: 'fit', word: 'HEART', spelledDifferently: false });

    const enter = s.step({ type: 'TTS_DONE' });
    expect(enter).toHaveLength(1);
    expect(enter[0]).toMatchObject({ type: 'ENTER', clueId: 'A1', word: 'HEART' });
    expect(enter[0].cells).toEqual([
      { index: 0, letter: 'H' }, { index: 1, letter: 'E' }, { index: 2, letter: 'A' },
      { index: 3, letter: 'R' }, { index: 4, letter: 'T' },
    ]);

    const after = s.step({
      type: 'ENTRY_RESULT',
      ok: true,
      snapshot: heartSnapshot(['HEART', '.....', '.....', '.....', '.....'], { selection: { clueId: 'A1' } }),
    });
    expect(after.find((a) => a.type === 'SELECT_CLUE').clueId).toBe('A6');
    expect(says(after)[0].label).toBe('6 Across');
  });

  test('REQ-ANS-007: length mismatch reported with numbers, conversation stays on the clue', () => {
    const s = listening(heartSnapshot(undefined, { selection: { clueId: 'A1' } }));
    const actions = s.step(heard('ocelot'));
    expect(says(actions)[0]).toMatchObject({ kind: 'length-mismatch', needed: 5 });
    expect(says(actions)[0].variants[0]).toEqual({ word: 'OCELOT', len: 6 });
    expect(types(s.step({ type: 'TTS_DONE' }))).toEqual(['LISTEN']); // same clue, listening again
  });

  test('REQ-ANS-008: collision names spot, letters, and the crossing clue; nothing entered', () => {
    const s = listening(heartSnapshot(['HEA.T', '.....', '.....', '.....', '.....'], { selection: { clueId: 'A1' } }));
    const actions = s.step(heard('heist'));
    const say = says(actions)[0];
    expect(say.kind).toBe('collision');
    expect(say.word).toBe('HEIST');
    expect(say.collisions).toEqual([{ pos: 2, want: 'I', have: 'A', crossLabel: '3 Down' }]);
    expect(types(s.step({ type: 'TTS_DONE' }))).toEqual(['LISTEN']); // not entered
  });

  test('REQ-ANS-012: explicit "enter it anyway" overrides the collision', () => {
    const s = listening(heartSnapshot(['HEA.T', '.....', '.....', '.....', '.....'], { selection: { clueId: 'A1' } }));
    s.step(heard('heist'));
    s.step({ type: 'TTS_DONE' });
    const actions = s.step(heard('enter it anyway'));
    expect(says(actions)[0]).toEqual({ kind: 'entering-anyway', word: 'HEIST' });
    const enter = s.step({ type: 'TTS_DONE' });
    expect(enter[0]).toMatchObject({ type: 'ENTER', word: 'HEIST' });
  });

  test('REQ-ANS-012: bare "anyway" (all STT often keeps of "say it anyway") also overrides', () => {
    const s = listening(heartSnapshot(['HEA.T', '.....', '.....', '.....', '.....'], { selection: { clueId: 'A1' } }));
    s.step(heard('heist'));
    s.step({ type: 'TTS_DONE' });
    const actions = s.step(heard('anyway'));
    expect(says(actions)[0]).toEqual({ kind: 'entering-anyway', word: 'HEIST' });
    expect(s.step({ type: 'TTS_DONE' })[0]).toMatchObject({ type: 'ENTER', word: 'HEIST' });
  });

  test('REQ-ANS-012: "anyway" with nothing pending falls through to answer evaluation', () => {
    const s = listening(heartSnapshot(undefined, { selection: { clueId: 'A1' } }));
    const actions = s.step(heard('anyway')); // ANYWAY (6) into a 5-cell entry → plain mismatch
    expect(says(actions)[0]).toMatchObject({ kind: 'length-mismatch', needed: 5 });
    expect(says(actions)[0].variants[0].word).toBe('ANYWAY');
  });

  test('REQ-ANS-009: ambiguous homophones ask; "second" picks and enters', () => {
    const s = listening(heartSnapshot(['.L...', '.....', '.....', '.....', '.....'], { selection: { clueId: 'A1' } }));
    const ask = s.step(heard('plain'));
    expect(says(ask)[0].kind).toBe('ambiguous');
    expect([...says(ask)[0].words].sort()).toEqual(['PLAIN', 'PLANE']);
    s.step({ type: 'TTS_DONE' });
    const chosenWord = says(ask)[0].words[1];
    const pick = s.step(heard('second'));
    expect(says(pick)[0]).toMatchObject({ kind: 'fit', word: chosenWord, spelledDifferently: true });
    const enter = s.step({ type: 'TTS_DONE' });
    expect(enter[0]).toMatchObject({ type: 'ENTER', word: chosenWord });
  });

  test('REQ-ANS-010: "you misheard" rejects the proposal; repeats of it no longer match', () => {
    const s = listening(heartSnapshot(['HEA.T', '.....', '.....', '.....', '.....'], { selection: { clueId: 'A1' } }));
    s.step(heard('heist')); // collision → lastProposed = HEIST
    s.step({ type: 'TTS_DONE' });
    const re = s.step(heard('you misheard'));
    expect(says(re)[0].kind).toBe('misheard-reprompt');
    s.step({ type: 'TTS_DONE' });
    const again = s.step(heard('heist')); // rejected now
    expect(says(again)[0].kind).toBe('didnt-catch');
  });

  test('REQ-ANS-010: "I meant X" evaluates X directly', () => {
    const s = listening(heartSnapshot(undefined, { selection: { clueId: 'A1' } }));
    const actions = s.step(heard('i meant heart'));
    expect(says(actions)[0]).toMatchObject({ kind: 'fit', word: 'HEART' });
  });

  test('REQ-ANS-011: spelling mode collects letters (names + NATO), auto-evaluates at length', () => {
    const s = listening(heartSnapshot(undefined, { selection: { clueId: 'A1' } }));
    expect(says(s.step(heard('spell')))[0].kind).toBe('spell-start');
    s.step({ type: 'TTS_DONE' });
    expect(says(s.step(heard('h')))[0]).toEqual({ kind: 'spell-progress', letters: ['H'] });
    s.step({ type: 'TTS_DONE' });
    s.step(heard('echo'));
    s.step({ type: 'TTS_DONE' });
    s.step(heard('a'));
    s.step({ type: 'TTS_DONE' });
    expect(says(s.step(heard('x')))[0].letters).toEqual(['H', 'E', 'A', 'X']);
    s.step({ type: 'TTS_DONE' });
    expect(says(s.step(heard('undo')))[0].letters).toEqual(['H', 'E', 'A']); // undo removes one
    s.step({ type: 'TTS_DONE' });
    s.step(heard('are')); // letter-name → R
    s.step({ type: 'TTS_DONE' });
    const done = s.step(heard('tango')); // 5th letter → auto-evaluate
    expect(says(done)[0]).toMatchObject({ kind: 'fit', word: 'HEART' });
    const enter = s.step({ type: 'TTS_DONE' });
    expect(enter[0]).toMatchObject({ type: 'ENTER', word: 'HEART' });
  });

  test('REQ-ANS-014: bare "pass" is a command; "answer pass" plays the word PASS', () => {
    const blocked = makeSnapshot(['#...', '....', '....', '...#'], {
      clues: { A4: 'Walk casually' },
      selection: { clueId: 'A4' },
    });
    const s1 = listening(blocked);
    expect(types(s1.step(heard('pass')))).toContain('SELECT_CLUE'); // navigated away

    const s2 = listening(blocked);
    expect(says(s2.step(heard('answer pass')))[0]).toMatchObject({ kind: 'fit', word: 'PASS' });
  });

  test('REQ-ANS-016: replacing a filled entry needs a yes; identical word sails through', () => {
    const filled = heartSnapshot(['WRONG', '.....', '.....', '.....', '.....'], { selection: { clueId: 'A1' } });
    const s = listening(filled);
    const ask = s.step(heard('heart'));
    expect(says(ask)[0]).toEqual({ kind: 'replace-confirm', word: 'HEART', current: 'WRONG' });
    s.step({ type: 'TTS_DONE' });
    const yes = s.step(heard('yes'));
    expect(says(yes)[0]).toEqual({ kind: 'entering-anyway', word: 'HEART' });
    expect(s.step({ type: 'TTS_DONE' })[0]).toMatchObject({ type: 'ENTER', word: 'HEART' });

    const s2 = listening(filled);
    s2.step(heard('heart'));
    s2.step({ type: 'TTS_DONE' });
    const no = s2.step(heard('no'));
    expect(says(no)[0].kind).toBe('kept');

    const s3 = listening(heartSnapshot(['HEART', '.....', '.....', '.....', '.....'], { selection: { clueId: 'A1' } }));
    expect(says(s3.step(heard('heart')))[0].kind).toBe('fit'); // same word → no confirmation
  });

  test('REQ-ANS-016/REQ-ANS-012: "anyway" during the replace confirmation counts as yes', () => {
    const s = listening(heartSnapshot(['WRONG', '.....', '.....', '.....', '.....'], { selection: { clueId: 'A1' } }));
    s.step(heard('heart'));
    s.step({ type: 'TTS_DONE' });
    const go = s.step(heard('anyway'));
    expect(says(go)[0]).toEqual({ kind: 'entering-anyway', word: 'HEART' });
    expect(s.step({ type: 'TTS_DONE' })[0]).toMatchObject({ type: 'ENTER', word: 'HEART' });
  });

  test('REQ-ANS-017: "undo" clears the last entered answer, returns to its clue, and prompts', () => {
    const s = listening(heartSnapshot(undefined, { selection: { clueId: 'A1' } }));
    s.step(heard('heart'));
    s.step({ type: 'TTS_DONE' }); // ENTER issued
    s.step({
      type: 'ENTRY_RESULT',
      ok: true,
      snapshot: heartSnapshot(['HEART', '.....', '.....', '.....', '.....'], { selection: { clueId: 'A6' } }),
    }); // advanced to A6
    s.step({ type: 'TTS_DONE' });

    const undo = s.step(heard('undo'));
    expect(undo.find((a) => a.type === 'SELECT_CLUE').clueId).toBe('A1');
    const action = undo.find((a) => a.type === 'UNDO');
    expect(action.clueId).toBe('A1');
    // A1 was empty before the entry → every cell reverts to cleared.
    expect(action.cells).toEqual([0, 1, 2, 3, 4].map((index) => ({ index, letter: null })));

    const done = s.step({ type: 'UNDO_RESULT', ok: true, snapshot: heartSnapshot(undefined, { selection: { clueId: 'A1' } }) });
    expect(says(done)[0].kind).toBe('undone'); // "say it again, or spell it"
    s.step({ type: 'TTS_DONE' });
    expect(says(s.step(heard('heart')))[0]).toMatchObject({ kind: 'fit', word: 'HEART' }); // back on A1
  });

  test('REQ-ANS-017: undo restores letters the entry overwrote; nothing pending → says so', () => {
    // HEA.T on A1: HEIST entered via override wrote over H,E,A,T and filled the blank.
    const s = listening(heartSnapshot(['HEA.T', '.....', '.....', '.....', '.....'], { selection: { clueId: 'A1' } }));
    s.step(heard('heist'));
    s.step({ type: 'TTS_DONE' });
    s.step(heard('anyway'));
    s.step({ type: 'TTS_DONE' }); // ENTER
    s.step({
      type: 'ENTRY_RESULT',
      ok: true,
      snapshot: heartSnapshot(['HEIST', '.....', '.....', '.....', '.....'], { selection: { clueId: 'A6' } }),
    });
    s.step({ type: 'TTS_DONE' });
    const undo = s.step(heard('undo'));
    // Restore the pre-entry pattern: letters back, the blank cleared again.
    expect(undo.find((a) => a.type === 'UNDO').cells).toEqual([
      { index: 0, letter: 'H' }, { index: 1, letter: 'E' }, { index: 2, letter: 'A' },
      { index: 3, letter: null }, { index: 4, letter: 'T' },
    ]);

    const s2 = listening(heartSnapshot(undefined, { selection: { clueId: 'A1' } }));
    expect(says(s2.step(heard('undo')))[0].kind).toBe('nothing-to-undo');
  });

  test('REQ-ANS-013: failed write is announced; the clue stays current', () => {
    const s = listening(heartSnapshot(undefined, { selection: { clueId: 'A1' } }));
    s.step(heard('heart'));
    s.step({ type: 'TTS_DONE' }); // ENTER issued
    const failed = s.step({ type: 'ENTRY_RESULT', ok: false, snapshot: heartSnapshot(undefined, { selection: { clueId: 'A1' } }) });
    expect(says(failed)[0].kind).toBe('entry-failed');
    s.step({ type: 'TTS_DONE' });
    const repeat = s.step(heard('repeat'));
    expect(says(repeat)[0].label).toBe('1 Across'); // still on A1
  });
});

describe('hints, commands, control (HINT/CMD/READ)', () => {
  test('REQ-HINT-001: hint reads the pattern with blanks and progress', () => {
    const s = listening(heartSnapshot(['H..RT', '.....', '.....', '.....', '.....'], { selection: { clueId: 'A1' } }));
    const actions = s.step(heard('hint'));
    expect(says(actions)[0]).toEqual({
      kind: 'hint',
      pattern: ['H', null, null, 'R', 'T'],
      filled: 3,
      length: 5,
    });
  });

  test('REQ-READ-009: repeat re-reads the current clue without greeting', () => {
    const s = listening(heartSnapshot(undefined, { selection: { clueId: 'A9' } }));
    const actions = s.step(heard('repeat'));
    expect(says(actions)[0].label).toBe('9 Across');
    expect(says(actions)[0].greeting).toBeFalsy();
  });

  test('REQ-CMD-002: help lists commands and stays on the clue', () => {
    const s = listening(heartSnapshot(undefined, { selection: { clueId: 'A1' } }));
    expect(says(s.step(heard('help')))[0].kind).toBe('help');
    expect(types(s.step({ type: 'TTS_DONE' }))).toEqual(['LISTEN']);
  });

  test('REQ-CMD-003: unintelligible input → didn\'t-catch reprompt, no grid change', () => {
    const s = listening(heartSnapshot(undefined, { selection: { clueId: 'A1' } }));
    const actions = s.step(heard('...'));
    expect(says(actions)[0].kind).toBe('didnt-catch');
    expect(types(actions)).not.toContain('ENTER');
  });

  test('REQ-CMD-004: "goodbye" signs off and ends', () => {
    const s = listening(heartSnapshot(undefined, { selection: { clueId: 'A1' } }));
    expect(says(s.step(heard('goodbye')))[0].kind).toBe('goodbye');
    expect(types(s.step({ type: 'TTS_DONE' }))).toEqual(['END']);
  });

  test('REQ-CMD-006: "stop" mid-readout (BARGE_IN) → sign-off, then end', () => {
    const s = scenario();
    s.step({ type: 'START', snapshot: heartSnapshot(undefined, { selection: { clueId: 'A1' } }) });
    const actions = s.step({ type: 'BARGE_IN' }); // shell heard a stop during the readout
    expect(says(actions)[0].kind).toBe('goodbye');
    expect(types(s.step({ type: 'TTS_DONE' }))).toEqual(['END']);
  });

  test('REQ-CMD-006: stop during the sign-off ends silently; BARGE_IN while not speaking is ignored', () => {
    const s = scenario();
    s.step({ type: 'START', snapshot: heartSnapshot(undefined, { selection: { clueId: 'A1' } }) });
    s.step({ type: 'BARGE_IN' }); // goodbye starts speaking
    expect(s.step({ type: 'BARGE_IN' })).toEqual([{ type: 'END' }]); // no second goodbye
    expect(s.state().phase).toBe('done');

    const s2 = listening(heartSnapshot(undefined, { selection: { clueId: 'A1' } }));
    expect(s2.step({ type: 'BARGE_IN' })).toEqual([]); // nothing speaking — nothing to interrupt
  });

  test('REQ-CMD-005: silence is never nagged — quiet re-listen under the timeout, silent end past it', () => {
    const s = listening(heartSnapshot(undefined, { selection: { clueId: 'A1' } }));
    const noSpeech = (silentMs) => ({ type: 'STT_ERROR', code: 'no-speech', silentMs });
    // Below the timeout: keep listening without a single SAY.
    expect(types(s.step(noSpeech(8_000)))).toEqual(['LISTEN']);
    expect(types(s.step(noSpeech(SILENCE_TIMEOUT_MS - 1)))).toEqual(['LISTEN']);
    // At the timeout: end immediately — no goodbye, no reprompt, just END.
    expect(s.step(noSpeech(SILENCE_TIMEOUT_MS))).toEqual([{ type: 'END' }]);
    expect(s.state().phase).toBe('done');
  });
});

describe('speech errors and lifecycle tail (SPCH/LIFE)', () => {
  test('REQ-SPCH-003: mic denied → explanation, then end', () => {
    const s = listening(heartSnapshot(undefined, { selection: { clueId: 'A1' } }));
    expect(says(s.step({ type: 'STT_ERROR', code: 'not-allowed' }))[0].kind).toBe('mic-denied');
    expect(types(s.step({ type: 'TTS_DONE' }))).toEqual(['END']);
  });

  test('REQ-SPCH-004: transient error retries once, second failure ends; success resets', () => {
    const s = listening(heartSnapshot(undefined, { selection: { clueId: 'A1' } }));
    const net = { type: 'STT_ERROR', code: 'network' };
    expect(says(s.step(net))[0]).toEqual({ kind: 'stt-error', final: false });
    s.step({ type: 'TTS_DONE' });
    expect(says(s.step(net))[0]).toEqual({ kind: 'stt-error', final: true });
    expect(types(s.step({ type: 'TTS_DONE' }))).toEqual(['END']);

    const s2 = listening(heartSnapshot(undefined, { selection: { clueId: 'A1' } }));
    s2.step(net);
    s2.step({ type: 'TTS_DONE' });
    s2.step(heard('hint')); // success resets the retry budget
    s2.step({ type: 'TTS_DONE' });
    expect(says(s2.step(net))[0].final).toBe(false);
  });

  test('aborted recognition (our own teardown) is silent', () => {
    const s = listening(heartSnapshot(undefined, { selection: { clueId: 'A1' } }));
    expect(s.step({ type: 'STT_ERROR', code: 'aborted' })).toEqual([]);
  });

  test('REQ-LIFE-005: solved via our entry → celebration → end', () => {
    const s = listening(heartSnapshot(['HEART', 'EMBER', 'ABUSE', 'RESIN', 'TREN.'], { selection: { clueId: 'A9' } }));
    s.step(heard('trend'));
    s.step({ type: 'TTS_DONE' }); // ENTER
    const done = s.step({ type: 'ENTRY_RESULT', ok: true, snapshot: heartSnapshot(SOLVED_HEART_ROWS, { status: 'solved' }) });
    expect(says(done)[0].kind).toBe('celebration');
    expect(types(s.step({ type: 'TTS_DONE' }))).toEqual(['END']);
  });

  test('REQ-LIFE-005: solved externally (user typed) → celebration once, duplicates ignored', () => {
    const s = listening(heartSnapshot(undefined, { selection: { clueId: 'A1' } }));
    const solvedSnap = heartSnapshot(SOLVED_HEART_ROWS, { status: 'solved' });
    const first = s.step({ type: 'PAGE_EVENT', kind: 'solved', snapshot: solvedSnap });
    expect(says(first)[0].kind).toBe('celebration');
    expect(s.step({ type: 'PAGE_EVENT', kind: 'solved', snapshot: solvedSnap })).toEqual([]);
  });

  test('REQ-LIFE-006: entry completes the grid but puzzle is not solved → discrepancy, keep going', () => {
    const s = listening(heartSnapshot(['HEART', 'EMBER', 'ABUSE', 'RESIN', 'TREN.'], { selection: { clueId: 'A9' } }));
    s.step(heard('trend'));
    s.step({ type: 'TTS_DONE' });
    const full = s.step({
      type: 'ENTRY_RESULT',
      ok: true,
      snapshot: heartSnapshot(['HEART', 'EMBER', 'ABUSE', 'RESIN', 'TREND'], { status: 'active' }),
    });
    expect(says(full)[0].kind).toBe('grid-full-wrong');
    expect(types(s.step({ type: 'TTS_DONE' }))).toEqual(['LISTEN']);
  });

  test('external grid changes are absorbed without speaking', () => {
    const s = listening(heartSnapshot(undefined, { selection: { clueId: 'A1' } }));
    const actions = s.step({
      type: 'PAGE_EVENT',
      kind: 'grid',
      snapshot: heartSnapshot(['H....', '.....', '.....', '.....', '.....'], { selection: { clueId: 'A1' } }),
    });
    expect(actions).toEqual([]);
    expect(says(s.step(heard('hint')))[0].pattern[0]).toBe('H'); // fresh letters visible
  });
});

describe('half-duplex invariant', () => {
  test('REQ-SPCH-005: no action batch ever contains both SAY and LISTEN', () => {
    expect(allBatches.length).toBeGreaterThan(50);
    for (const batch of allBatches) {
      const hasSay = batch.some((a) => a.type === 'SAY');
      const hasListen = batch.some((a) => a.type === 'LISTEN');
      expect(hasSay && hasListen).toBe(false);
    }
  });
});
