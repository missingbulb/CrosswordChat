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

/** START + first TTS_DONE → phase 'listening'. Pass settings, e.g. { strategy: 'most-filled' }. */
function listening(snap, settings) {
  const s = scenario();
  s.step({ type: 'START', snapshot: snap, settings });
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

  test('REQ-NAV-006 (retired): wrap-around happens without any announcement', () => {
    const snap = heartSnapshot(['.....', 'EMBER', 'ABUSE', 'RESIN', 'TREND'], { selection: { clueId: 'D5' } });
    const s = listening(snap);
    const actions = s.step(heard('next'));
    expect(actions.find((a) => a.type === 'SELECT_CLUE').clueId).toBe('A1');
    expect(says(actions)[0].wrapped).toBeUndefined(); // plain clue readout, no wrap prefix
  });

  test('REQ-NAV-004: under most-filled (set in settings), "next" prefers the fuller clue', () => {
    const snap = heartSnapshot(['.....', 'EMBER', 'ABUSE', 'RESIN', 'TREND'], { selection: { clueId: 'A1' } });
    const s = listening(snap, { strategy: 'most-filled' });
    const nav = s.step(heard('next'));
    expect(nav.find((a) => a.type === 'SELECT_CLUE').clueId).toBe('D1'); // 4/5 filled beats empty A1
  });

  // Across-only grid (block rows kill the downs): four independent entries whose fill
  // ratios are fully controllable. A1 = 2/5, A2 = 3/5, A3 = 1/5, A4 = 0/5.
  const ratioRows = (a2 = 'CDE..') => ['AB...', '#####', a2, '#####', 'F....', '#####', '.....'];
  const picked = (actions) => actions.find((a) => a.type === 'SELECT_CLUE')?.clueId;

  test('REQ-NAV-011: repeated "next" under most-filled walks ratios down, no ping-pong, then cycles', () => {
    const s = listening(makeSnapshot(ratioRows(), { selection: { clueId: 'A4' } }), { strategy: 'most-filled' });
    const walk = [];
    for (let i = 0; i < 5; i++) {
      walk.push(picked(s.step(heard('next'))));
      s.step({ type: 'TTS_DONE' });
    }
    // Descending ratio (A2 60%, A1 40%, A3 20%, A4 0%) — never straight back to the
    // fullest — and once everything was skipped, the oldest skip (A2) comes around again.
    expect(walk).toEqual(['A2', 'A1', 'A3', 'A4', 'A2']);
  });

  test('REQ-NAV-011: a skipped clue whose letters changed is back in the running', () => {
    const s = listening(makeSnapshot(ratioRows(), { selection: { clueId: 'A4' } }), { strategy: 'most-filled' });
    expect(picked(s.step(heard('next')))).toBe('A2'); // skips A4
    s.step({ type: 'TTS_DONE' });
    expect(picked(s.step(heard('next')))).toBe('A1'); // skips A2 (3/5)
    s.step({ type: 'TTS_DONE' });
    // A2 gains a letter (e.g. the user typed one) → its skip record no longer applies.
    s.step({ type: 'PAGE_EVENT', kind: 'grid', snapshot: makeSnapshot(ratioRows('CDEF.')) });
    expect(picked(s.step(heard('next')))).toBe('A2'); // 4/5 and eligible again; A4 stays skipped
  });

  test('REQ-NAV-009: under most-filled, "back" retraces the visited trail, then falls back to list order', () => {
    const s = listening(makeSnapshot(ratioRows(), { selection: { clueId: 'A4' } }), { strategy: 'most-filled' });
    expect(picked(s.step(heard('next')))).toBe('A2'); // highest ratio; trail: A4
    s.step({ type: 'TTS_DONE' });
    expect(picked(s.step(heard('next')))).toBe('A1'); // trail: A4, A2
    s.step({ type: 'TTS_DONE' });
    expect(picked(s.step(heard('back')))).toBe('A2'); // newest crumb first — NOT list order
    s.step({ type: 'TTS_DONE' });
    expect(picked(s.step(heard('back')))).toBe('A4'); // keeps walking backward, no ping-pong
    s.step({ type: 'TTS_DONE' });
    expect(picked(s.step(heard('back')))).toBe('A3'); // trail dry → previous in list order
  });

  test('REQ-NAV-009: under most-filled, a click leaves a crumb — "back" returns to where you were', () => {
    const s = scenario();
    s.step({
      type: 'START',
      snapshot: heartSnapshot(undefined, { selection: { clueId: 'A1' } }),
      settings: { strategy: 'most-filled' },
    });
    s.step({ type: 'TTS_DONE' });
    s.step({
      type: 'PAGE_EVENT',
      kind: 'selection',
      snapshot: heartSnapshot(undefined, { selection: { clueId: 'D2' } }),
    });
    s.step({ type: 'TTS_DONE' });
    expect(picked(s.step(heard('back')))).toBe('A1');
  });

  test('REQ-NAV-012: the stored strategy setting is applied from session start', () => {
    const snap = heartSnapshot(['.....', 'EMBER', 'ABUSE', 'RESIN', 'TREND'], { selection: { clueId: 'A1' } });
    const s = scenario();
    s.step({ type: 'START', snapshot: snap, settings: { strategy: 'most-filled' } });
    s.step({ type: 'TTS_DONE' });
    expect(picked(s.step(heard('next')))).toBe('D1'); // 4/5 filled beats empty A1 — no voice switch needed
  });

  test('REQ-NAV-012: a missing or invalid stored strategy falls back to list order', () => {
    const snap = heartSnapshot(undefined, { selection: { clueId: 'A1' } });
    const s = scenario();
    s.step({ type: 'START', snapshot: snap, settings: { strategy: 'bogus' } });
    s.step({ type: 'TTS_DONE' });
    expect(picked(s.step(heard('next')))).toBe('A6'); // plain list order
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

  test('REQ-ANS-026: a mic-caught sentence is never read back as a giant length report', () => {
    const s = listening(heartSnapshot(undefined, { selection: { clueId: 'A1' } }));
    const actions = s.step(heard('i think it might possibly be something like a river'));
    // Not the frustrating "... is 45 letters, we need 5" — just a quiet re-prompt.
    expect(says(actions)[0]).toEqual({ kind: 'didnt-catch' });
    expect(actions.some((a) => a.type === 'ENTER')).toBe(false);
    expect(types(s.step({ type: 'TTS_DONE' }))).toEqual(['LISTEN']); // same clue
  });

  test('REQ-ANS-026: the answer said twice ("heart heart") enters the single word', () => {
    const s = listening(heartSnapshot(undefined, { selection: { clueId: 'A1' } }));
    const actions = s.step(heard('heart heart'));
    expect(says(actions)[0]).toMatchObject({ kind: 'fit', word: 'HEART' });
    expect(s.step({ type: 'TTS_DONE' })[0]).toMatchObject({ type: 'ENTER', clueId: 'A1', word: 'HEART' });
  });

  test('REQ-ANS-026: a command buried in an over-long utterance is still obeyed', () => {
    const s = listening(heartSnapshot(undefined, { selection: { clueId: 'A1' } }));
    const actions = s.step(heard('okay lets just hit next for now'));
    // "next" plucked from the noise → move on, not a didnt-catch.
    expect(says(actions)[0].kind).toBe('clue');
    expect(actions.some((a) => a.type === 'SELECT_CLUE')).toBe(true);
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

  test('REQ-ANS-012: "anyway" with nothing pending says so — no absurd answer reading', () => {
    const s = listening(heartSnapshot(undefined, { selection: { clueId: 'A1' } }));
    const actions = s.step(heard('anyway')); // no proposal exists — nothing to force in
    expect(says(actions)[0].kind).toBe('nothing-pending');
    s.step({ type: 'TTS_DONE' });
    // If ANYWAY really is the answer, the REQ-ANS-014 escape hatch still applies.
    const forced = s.step(heard('the answer is anyway'));
    expect(says(forced)[0]).toMatchObject({ kind: 'length-mismatch', needed: 5 }); // ANYWAY is 6
  });

  test('REQ-ANS-023: a clash on a PENCILED letter is no clash — fits and writes over', () => {
    // A1 reads _EA__ with the A penciled (lowercase in fixture rows): HEIST disagrees
    // only with that penciled A → no collision report, plain fit.
    const s = listening(heartSnapshot(['.Ea..', '.....', '.....', '.....', '.....'], { selection: { clueId: 'A1' } }));
    const out = s.step(heard('heist'));
    expect(says(out)[0]).toMatchObject({ kind: 'fit', word: 'HEIST' });
    expect(s.step({ type: 'TTS_DONE' })[0]).toMatchObject({ type: 'ENTER', clueId: 'A1', word: 'HEIST' });
  });

  test('REQ-ANS-023: the same clash on a PEN letter still collides', () => {
    const s = listening(heartSnapshot(['.EA..', '.....', '.....', '.....', '.....'], { selection: { clueId: 'A1' } }));
    const out = s.step(heard('heist'));
    expect(says(out)[0]).toMatchObject({ kind: 'collision', word: 'HEIST' });
    expect(out.find((a) => a.type === 'ENTER')).toBeUndefined();
  });

  test('REQ-ANS-023/REQ-PAGE-012: letters WE penciled never gate, even when the page cannot report pencil state', () => {
    // Live-page reality: snapshots carry penciled:false for everything. The override
    // softens D3's U (REQ-ANS-019); the ENTRY_RESULT snapshot comes back with a plain
    // pen U — only the machine's own ledger knows it is soft.
    const s = listening(heartSnapshot(['HEA.T', 'EMBER', '..U..', '.....', '.....'], { selection: { clueId: 'A1' } }));
    s.step(heard('heist'));
    s.step({ type: 'TTS_DONE' });
    s.step(heard('anyway'));
    s.step({ type: 'TTS_DONE' }); // ENTER (word + pencil rewrite of D3's U)
    s.step({
      type: 'ENTRY_RESULT',
      ok: true, // note the UPPERCASE U: the live page shows no pencil marker
      snapshot: heartSnapshot(['HEIST', 'EMBER', '..U..', '.....', '.....'], { selection: { clueId: 'A7' } }),
    });
    s.step({ type: 'TTS_DONE' });
    s.step(heard('three down')); // D3 now reads I, B, U(soft), _, _
    s.step({ type: 'TTS_DONE' });
    const out = s.step(heard('ibsen')); // disagrees only with the softened U
    expect(says(out)[0]).toMatchObject({ kind: 'fit', word: 'IBSEN' });
  });

  test('REQ-ANS-023: undo restores the soft-cell ledger along with the letters', () => {
    const s = listening(heartSnapshot(['HEA.T', 'EMBER', '..U..', '.....', '.....'], { selection: { clueId: 'A1' } }));
    s.step(heard('heist'));
    s.step({ type: 'TTS_DONE' });
    s.step(heard('anyway'));
    s.step({ type: 'TTS_DONE' }); // ENTER
    s.step({
      type: 'ENTRY_RESULT',
      ok: true,
      snapshot: heartSnapshot(['HEIST', 'EMBER', '..U..', '.....', '.....'], { selection: { clueId: 'A7' } }),
    });
    s.step({ type: 'TTS_DONE' });
    s.step(heard('undo')); // un-softens the U back to pen…
    s.step({
      type: 'UNDO_RESULT',
      ok: true,
      snapshot: heartSnapshot(['HEA.T', 'EMBER', '..U..', '.....', '.....'], { selection: { clueId: 'A1' } }),
    });
    s.step({ type: 'TTS_DONE' });
    s.step(heard('three down'));
    s.step({ type: 'TTS_DONE' });
    // …so a clash with it (pen again, ledger restored) is a real collision once more.
    const out = s.step(heard('abbey')); // D3 reads A,B,U,_,_ — ABBEY clashes at the U
    expect(says(out)[0]).toMatchObject({ kind: 'collision', word: 'ABBEY' });
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

  /** Enter HEART on an empty A1 and advance to A6 — the setup for post-entry corrections. */
  function enteredHeart() {
    const s = listening(heartSnapshot(undefined, { selection: { clueId: 'A1' } }));
    s.step(heard('heart'));
    s.step({ type: 'TTS_DONE' }); // ENTER issued
    s.step({
      type: 'ENTRY_RESULT',
      ok: true,
      snapshot: heartSnapshot(['HEART', '.....', '.....', '.....', '.....'], { selection: { clueId: 'A6' } }),
    }); // advanced to A6
    s.step({ type: 'TTS_DONE' });
    return s;
  }

  test('REQ-ANS-010: "you misheard" after the word landed undoes the entry, rejects it, reprompts', () => {
    const s = enteredHeart();
    const undo = s.step(heard('you misheard'));
    expect(undo.find((a) => a.type === 'UNDO').clueId).toBe('A1'); // back to the entry's clue
    const done = s.step({ type: 'UNDO_RESULT', ok: true, snapshot: heartSnapshot(undefined, { selection: { clueId: 'A1' } }) });
    expect(says(done)[0].kind).toBe('misheard-reprompt');
    s.step({ type: 'TTS_DONE' });
    // The undone word is rejected on this clue now.
    expect(says(s.step(heard('heart')))[0].kind).toBe('didnt-catch');
  });

  test('REQ-ANS-010: "no I said X" after the word landed undoes the entry, then evaluates X there', () => {
    const s = enteredHeart();
    const undo = s.step(heard('no i said heist'));
    expect(undo.find((a) => a.type === 'UNDO').clueId).toBe('A1');
    const fix = s.step({ type: 'UNDO_RESULT', ok: true, snapshot: heartSnapshot(undefined, { selection: { clueId: 'A1' } }) });
    expect(says(fix)[0]).toMatchObject({ kind: 'fit', word: 'HEIST' });
    expect(s.step({ type: 'TTS_DONE' })[0]).toMatchObject({ type: 'ENTER', clueId: 'A1', word: 'HEIST' });
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

  test('REQ-ANS-018: spelling just the missing letters fills the open squares', () => {
    // A1 reads H__R_ — three open squares.
    const s = listening(heartSnapshot(['H..R.', '.....', '.....', '.....', '.....'], { selection: { clueId: 'A1' } }));
    const start = s.step(heard('spell'));
    expect(says(start)[0]).toEqual({ kind: 'spell-start', open: 3, length: 5 });
    s.step({ type: 'TTS_DONE' });
    s.step(heard('e'));
    s.step({ type: 'TTS_DONE' });
    s.step(heard('a'));
    s.step({ type: 'TTS_DONE' });
    expect(says(s.step(heard('t')))[0]).toEqual({ kind: 'spell-progress', letters: ['E', 'A', 'T'] });
    s.step({ type: 'TTS_DONE' });
    const done = s.step(heard('done'));
    // The user voiced only part of the word, so the whole merged word is read back.
    expect(says(done)[0]).toMatchObject({ kind: 'fit', word: 'HEART', spelledDifferently: true });
    const enter = s.step({ type: 'TTS_DONE' });
    expect(enter[0]).toMatchObject({ type: 'ENTER', word: 'HEART' });
  });

  test('REQ-ANS-018: full-length spelling still works on a partially solved entry', () => {
    const s = listening(heartSnapshot(['H..R.', '.....', '.....', '.....', '.....'], { selection: { clueId: 'A1' } }));
    s.step(heard('spell'));
    s.step({ type: 'TTS_DONE' });
    for (const letter of ['h', 'echo', 'a', 'are']) {
      s.step(heard(letter));
      s.step({ type: 'TTS_DONE' });
    }
    const done = s.step(heard('tango')); // 5th letter → auto-evaluate as the whole word
    expect(says(done)[0]).toMatchObject({ kind: 'fit', word: 'HEART' });
    expect(s.step({ type: 'TTS_DONE' })[0]).toMatchObject({ type: 'ENTER', word: 'HEART' });
  });

  test('REQ-ANS-018: a count matching neither the word nor the open squares names both', () => {
    const s = listening(heartSnapshot(['H..R.', '.....', '.....', '.....', '.....'], { selection: { clueId: 'A1' } }));
    s.step(heard('spell'));
    s.step({ type: 'TTS_DONE' });
    s.step(heard('e'));
    s.step({ type: 'TTS_DONE' });
    s.step(heard('a'));
    s.step({ type: 'TTS_DONE' });
    const short = s.step(heard('done')); // 2 letters: not 5, not 3
    expect(says(short)[0]).toMatchObject({ kind: 'length-mismatch', needed: 5, open: 3 });
    s.step({ type: 'TTS_DONE' });
    // Still spelling with the buffer intact — one more letter reaches the open count.
    s.step(heard('t'));
    s.step({ type: 'TTS_DONE' });
    const done = s.step(heard('done'));
    expect(says(done)[0]).toMatchObject({ kind: 'fit', word: 'HEART' });
  });

  test('REQ-ANS-020: a spelled-out answer works straight from normal listening — no mode', () => {
    const s = listening(heartSnapshot(undefined, { selection: { clueId: 'A1' } }));
    const fit = s.step(heard('aitch e a are tea')); // letter names, one utterance
    expect(says(fit)[0]).toMatchObject({ kind: 'fit', word: 'HEART', spelledDifferently: true });
    expect(s.step({ type: 'TTS_DONE' })[0]).toMatchObject({ type: 'ENTER', word: 'HEART' });
  });

  test('REQ-ANS-022: saying the word and then spelling it is accepted as one answer', () => {
    const s = listening(heartSnapshot(undefined, { selection: { clueId: 'A1' } }));
    const fit = s.step(heard('heart h e a r t')); // the word, then its spelling
    expect(says(fit)[0]).toMatchObject({ kind: 'fit', word: 'HEART', spelledDifferently: true });
    expect(s.step({ type: 'TTS_DONE' })[0]).toMatchObject({ type: 'ENTER', word: 'HEART' });
  });

  test('REQ-ANS-018: open-square spelling works straight from normal listening too', () => {
    // H E _ R _ — the user just says the two missing letters, no "spell", no mode.
    const s = listening(heartSnapshot(['HE.R.', '.....', '.....', '.....', '.....'], { selection: { clueId: 'A1' } }));
    const fit = s.step(heard('alpha tango'));
    expect(says(fit)[0]).toMatchObject({ kind: 'fit', word: 'HEART', spelledDifferently: true });
    expect(s.step({ type: 'TTS_DONE' })[0]).toMatchObject({ type: 'ENTER', word: 'HEART' });
  });

  test('REQ-CMD-001: "spell h e a r t" in one breath evaluates immediately', () => {
    const s = listening(heartSnapshot(undefined, { selection: { clueId: 'A1' } }));
    const fit = s.step(heard('spell h e a r t'));
    expect(says(fit)[0]).toMatchObject({ kind: 'fit', word: 'HEART' });
    expect(s.step({ type: 'TTS_DONE' })[0]).toMatchObject({ type: 'ENTER', word: 'HEART' });
  });

  test('REQ-CMD-001: "spell" + some letters seeds the buffer and keeps collecting', () => {
    const s = listening(heartSnapshot(undefined, { selection: { clueId: 'A1' } }));
    const start = s.step(heard('spell h e'));
    expect(says(start)[0]).toEqual({ kind: 'spell-progress', letters: ['H', 'E'] });
    s.step({ type: 'TTS_DONE' });
    s.step(heard('a'));
    s.step({ type: 'TTS_DONE' });
    s.step(heard('are'));
    s.step({ type: 'TTS_DONE' });
    const done = s.step(heard('tango'));
    expect(says(done)[0]).toMatchObject({ kind: 'fit', word: 'HEART' });
  });

  test('REQ-ANS-011: ordinary commands escape spelling mode — it never traps the user', () => {
    const s = listening(heartSnapshot(undefined, { selection: { clueId: 'A1' } }));
    s.step(heard('spell'));
    s.step({ type: 'TTS_DONE' });
    s.step(heard('h'));
    s.step({ type: 'TTS_DONE' });
    const out = s.step(heard('next')); // not a letter, not a control — still a command
    expect(says(out)[0]).toMatchObject({ kind: 'clue' }); // advanced to another clue
    expect(says(out)[0].label).not.toBe('1 Across');
    s.step({ type: 'TTS_DONE' });
    // Spelling state did not leak into the new clue.
    expect(says(s.step(heard('spell')))[0].kind).toBe('spell-start');
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
    // The revert's cell clicks can leave the page cursor on a crossing clue — the
    // machine reasserts the undone clue so page and conversation agree again.
    expect(done.find((a) => a.type === 'SELECT_CLUE').clueId).toBe('A1');
    expect(says(done)[0].kind).toBe('undone'); // a brief "Undone."…
    expect(says(done)[1]).toMatchObject({ kind: 'clue', label: '1 Across' }); // …then the clue again
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

  test('REQ-ANS-019: the override\'s ENTER also pencils the malformed crossing\'s surviving letters', () => {
    // A1 reads HEA_T; D3 also holds B (from full A6 = EMBER) and a lone U. Overriding
    // with HEIST malforms D3: the U is softened to pencil in the SAME write; the B
    // keeps its pen (EMBER, a full entry, still corroborates it).
    const s = listening(heartSnapshot(['HEA.T', 'EMBER', '..U..', '.....', '.....'], { selection: { clueId: 'A1' } }));
    s.step(heard('heist'));
    s.step({ type: 'TTS_DONE' });
    s.step(heard('anyway'));
    const enter = s.step({ type: 'TTS_DONE' })[0];
    expect(enter).toMatchObject({ type: 'ENTER', clueId: 'A1', word: 'HEIST' });
    expect(enter.cells).toEqual([
      { index: 0, letter: 'H' }, { index: 1, letter: 'E' }, { index: 2, letter: 'I' },
      { index: 3, letter: 'S' }, { index: 4, letter: 'T' },
      { index: 12, letter: 'U', pencil: true },
    ]);
  });

  test('REQ-ANS-019: a clean fit pencils nothing — the ENTER carries only the word', () => {
    const s = listening(heartSnapshot(['HEA.T', '..B..', '.....', '.....', '.....'], { selection: { clueId: 'A1' } }));
    s.step(heard('heart')); // agrees with every existing letter
    const enter = s.step({ type: 'TTS_DONE' })[0];
    expect(enter.cells).toEqual([
      { index: 0, letter: 'H' }, { index: 1, letter: 'E' }, { index: 2, letter: 'A' },
      { index: 3, letter: 'R' }, { index: 4, letter: 'T' },
    ]);
  });

  test('REQ-ANS-019/REQ-ANS-017: undo reverts the softening — penciled survivors go back to pen', () => {
    const s = listening(heartSnapshot(['HEA.T', 'EMBER', '..U..', '.....', '.....'], { selection: { clueId: 'A1' } }));
    s.step(heard('heist'));
    s.step({ type: 'TTS_DONE' });
    s.step(heard('anyway'));
    s.step({ type: 'TTS_DONE' }); // ENTER (with the pencil rewrite)
    s.step({
      type: 'ENTRY_RESULT',
      ok: true, // the page now shows HEIST, and D3's U penciled (lowercase)
      snapshot: heartSnapshot(['HEIST', 'EMBER', '..u..', '.....', '.....'], { selection: { clueId: 'A7' } }),
    });
    s.step({ type: 'TTS_DONE' });
    const undo = s.step(heard('undo'));
    expect(undo.find((a) => a.type === 'SELECT_CLUE').clueId).toBe('A1');
    expect(undo.find((a) => a.type === 'UNDO').cells).toEqual([
      // The entry's cells revert to what they held (all pen), the blank clears again…
      { index: 0, letter: 'H' }, { index: 1, letter: 'E' }, { index: 2, letter: 'A' },
      { index: 3, letter: null }, { index: 4, letter: 'T' },
      // …and the survivor we penciled is explicitly rewritten in pen.
      { index: 12, letter: 'U', pencil: false },
    ]);
  });

  test('REQ-ANS-017/REQ-ANS-019: undo restores overwritten letters with the pencil state they had', () => {
    // A6's E and B sit penciled (softened by an earlier override). Entering EMBER pens
    // over them; undo must bring them back penciled, not silently promoted to pen.
    const s = listening(heartSnapshot(['HEART', 'e.b..', '.....', '.....', '.....'], { selection: { clueId: 'A6' } }));
    s.step(heard('ember'));
    s.step({ type: 'TTS_DONE' }); // ENTER
    s.step({
      type: 'ENTRY_RESULT',
      ok: true,
      snapshot: heartSnapshot(['HEART', 'EMBER', '.....', '.....', '.....'], { selection: { clueId: 'A7' } }),
    });
    s.step({ type: 'TTS_DONE' });
    const undo = s.step(heard('undo'));
    expect(undo.find((a) => a.type === 'UNDO').cells).toEqual([
      { index: 5, letter: 'E', pencil: true }, { index: 6, letter: null },
      { index: 7, letter: 'B', pencil: true }, { index: 8, letter: null }, { index: 9, letter: null },
    ]);
  });

  test('REQ-ANS-019/REQ-ANS-016: a confirmed replacement softens the crossings it hurts, too', () => {
    // A1 is fully filled with WRONG; D1 below it holds a lone E. Replacing WRONG with
    // HEART changes A1's W (D1's first letter), malforming D1 → its E gets penciled.
    const s = listening(heartSnapshot(['WRONG', 'E....', '.....', '.....', '.....'], { selection: { clueId: 'A1' } }));
    s.step(heard('heart'));
    s.step({ type: 'TTS_DONE' });
    s.step(heard('yes'));
    const enter = s.step({ type: 'TTS_DONE' })[0];
    expect(enter).toMatchObject({ type: 'ENTER', word: 'HEART' });
    expect(enter.cells).toContainEqual({ index: 5, letter: 'E', pencil: true });
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

  test('REQ-CMD-001: "letters" and "spell it" are hint synonyms; spelling mode still opens with "spell"', () => {
    const s = listening(heartSnapshot(['H..RT', '.....', '.....', '.....', '.....'], { selection: { clueId: 'A1' } }));
    expect(says(s.step(heard('letters')))[0].kind).toBe('hint');
    s.step({ type: 'TTS_DONE' });
    expect(says(s.step(heard('spell it')))[0].kind).toBe('hint'); // reads letters, not spelling mode
    s.step({ type: 'TTS_DONE' });
    expect(says(s.step(heard('spell')))[0].kind).toBe('spell-start');
  });

  test('REQ-READ-009: repeat re-reads the current clue without greeting', () => {
    const s = listening(heartSnapshot(undefined, { selection: { clueId: 'A9' } }));
    const actions = s.step(heard('repeat'));
    expect(says(actions)[0].label).toBe('9 Across');
    expect(says(actions)[0].greeting).toBeFalsy();
  });

  test('REQ-READ-009: "say again" re-reads the current clue too', () => {
    const s = listening(heartSnapshot(undefined, { selection: { clueId: 'A9' } }));
    const actions = s.step(heard('say again'));
    expect(says(actions)[0]).toMatchObject({ kind: 'clue', label: '9 Across' });
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

describe('barge-in input (SPCH)', () => {
  test('REQ-SPCH-009: an answer heard mid-readout is processed without waiting', () => {
    const s = scenario();
    s.step({ type: 'START', snapshot: heartSnapshot(undefined, { selection: { clueId: 'A1' } }) });
    // Still speaking the opening readout — the shell barged in with a HEARD.
    const actions = s.step(heard('heart'));
    expect(says(actions)[0]).toMatchObject({ kind: 'fit', word: 'HEART' });
  });

  test('REQ-SPCH-009: a command heard mid-readout is processed without waiting', () => {
    const s = scenario();
    s.step({ type: 'START', snapshot: heartSnapshot(undefined, { selection: { clueId: 'A1' } }) });
    const actions = s.step(heard('next'));
    expect(actions.find((a) => a.type === 'SELECT_CLUE').clueId).toBe('A6');
    expect(says(actions)[0].label).toBe('6 Across');
  });

  test('REQ-SPCH-009: input while the fit confirmation plays is ignored — the entry must land', () => {
    const s = listening(heartSnapshot(undefined, { selection: { clueId: 'A1' } }));
    s.step(heard('heart')); // "Fits!" is speaking, after:'enter'
    expect(s.step(heard('next'))).toEqual([]); // ignored
    expect(s.step({ type: 'TTS_DONE' })[0]).toMatchObject({ type: 'ENTER', word: 'HEART' });
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

  test('REQ-LIFE-006: "next" on a full grid moves to the next clue — never the same prompt again', () => {
    const s = listening(heartSnapshot(['HEART', 'EMBER', 'ABUSE', 'RESIN', 'TREND'], { selection: { clueId: 'A1' } }));
    const out = s.step(heard('next'));
    expect(says(out)[0]).toMatchObject({ kind: 'clue', label: '6 Across' }); // moved forward
    s.step({ type: 'TTS_DONE' });
    const again = s.step(heard('next'));
    expect(says(again)[0]).toMatchObject({ kind: 'clue', label: '7 Across' }); // keeps moving
  });

  // Full-but-wrong grid with penciled letters (lowercase u at index 12): the suspects
  // are the entries holding pencil — A7 (row 2) and D3 (column 2).
  const FULL_PENCIL_ROWS = ['HEIST', 'EMBER', 'ABuSE', 'RESIN', 'TREND'];

  test('REQ-NAV-014: an entry that fills the grid wrong jumps straight to a penciled entry', () => {
    const s = listening(heartSnapshot(['HEIST', 'EMBER', 'ABuSE', 'RESIN', 'TREN.'], { selection: { clueId: 'A9' } }));
    s.step(heard('trend'));
    s.step({ type: 'TTS_DONE' }); // ENTER
    const full = s.step({
      type: 'ENTRY_RESULT',
      ok: true,
      snapshot: heartSnapshot(FULL_PENCIL_ROWS, { selection: { clueId: 'A9' } }),
    });
    expect(says(full).map((x) => x.kind)).toEqual(['grid-full-wrong', 'clue']);
    // From A9, the next suspect in list order is D3 (the penciled column).
    expect(full.find((a) => a.type === 'SELECT_CLUE').clueId).toBe('D3');
  });

  test('REQ-NAV-014: "next" on a full grid patrols the penciled entries only', () => {
    const s = listening(heartSnapshot(FULL_PENCIL_ROWS, { selection: { clueId: 'D3' } }));
    const out = s.step(heard('next'));
    expect(says(out)[0]).toMatchObject({ kind: 'clue', label: '7 Across' }); // wraps to A7
    s.step({ type: 'TTS_DONE' });
    const again = s.step(heard('next'));
    expect(says(again)[0]).toMatchObject({ kind: 'clue', label: '3 Down' }); // …and back
  });

  test('REQ-NAV-014: a full-but-wrong session start lands on a penciled entry', () => {
    const s = scenario();
    const actions = s.step({ type: 'START', snapshot: heartSnapshot(FULL_PENCIL_ROWS) });
    expect(says(actions).map((x) => x.kind)).toEqual(['grid-full-wrong', 'clue']);
    expect(says(actions)[1].label).toBe('7 Across'); // first suspect in list order
  });

  test('REQ-NAV-010: flip crosses at the SELECTED square, not the entry\'s first letter', () => {
    const s = listening(heartSnapshot(undefined, { selection: { clueId: 'A1', cellIndex: 2 } }));
    const out = s.step(heard('flip'));
    expect(out.find((a) => a.type === 'SELECT_CLUE').clueId).toBe('D3'); // crossing at cell 2
    expect(says(out)[0]).toMatchObject({ kind: 'clue', label: '3 Down' });
  });

  test('REQ-NAV-013: a clear direction with a garbled number asks again instead of guessing', () => {
    const s = listening(heartSnapshot(undefined, { selection: { clueId: 'A1' } }));
    const out = s.step(heard('gibberish across'));
    expect(says(out)[0]).toEqual({ kind: 'goto-didnt-catch' });
    expect(out.find((a) => a.type === 'SELECT_CLUE')).toBeUndefined();
  });

  test('REQ-ANS-024: "clear" empties the current entry and "undo" brings it back, pencil states intact', () => {
    // A1 holds H, E, A(penciled), blank, T.
    const s = listening(heartSnapshot(['HEa.T', '.....', '.....', '.....', '.....'], { selection: { clueId: 'A1' } }));
    const out = s.step(heard('clear'));
    expect(out.find((a) => a.type === 'UNDO').cells).toEqual([
      { index: 0, letter: null }, { index: 1, letter: null }, { index: 2, letter: null },
      { index: 3, letter: null }, { index: 4, letter: null },
    ]);
    const done = s.step({
      type: 'UNDO_RESULT',
      ok: true,
      snapshot: heartSnapshot(undefined, { selection: { clueId: 'A1' } }),
    });
    expect(done.find((a) => a.type === 'SELECT_CLUE').clueId).toBe('A1');
    expect(says(done)[0]).toEqual({ kind: 'cleared' });
    s.step({ type: 'TTS_DONE' });
    const undo = s.step(heard('undo'));
    expect(undo.find((a) => a.type === 'UNDO').cells).toEqual([
      { index: 0, letter: 'H' }, { index: 1, letter: 'E' },
      { index: 2, letter: 'A', pencil: true }, // restored penciled, not promoted to pen
      { index: 3, letter: null }, { index: 4, letter: 'T' },
    ]);
  });

  test('REQ-ANS-024: "delete" on an empty entry says so and keeps listening', () => {
    const s = listening(heartSnapshot(undefined, { selection: { clueId: 'A1' } }));
    const out = s.step(heard('delete'));
    expect(says(out)[0]).toEqual({ kind: 'nothing-to-clear' });
    expect(out.find((a) => a.type === 'UNDO')).toBeUndefined();
  });

  test('REQ-ANS-025: "pencil" makes answers land penciled — and they never gate later words', () => {
    const s = listening(heartSnapshot(undefined, { selection: { clueId: 'A1' } }));
    expect(says(s.step(heard('pencil')))[0]).toEqual({ kind: 'mode-ack', mode: 'pencil' });
    s.step({ type: 'TTS_DONE' });
    s.step(heard('heart'));
    const enter = s.step({ type: 'TTS_DONE' })[0];
    expect(enter.cells).toEqual([
      { index: 0, letter: 'H', pencil: true }, { index: 1, letter: 'E', pencil: true },
      { index: 2, letter: 'A', pencil: true }, { index: 3, letter: 'R', pencil: true },
      { index: 4, letter: 'T', pencil: true },
    ]);
    s.step({
      type: 'ENTRY_RESULT',
      ok: true, // the live page reports plain pen letters — only the ledger knows
      snapshot: heartSnapshot(['HEART', '.....', '.....', '.....', '.....'], { selection: { clueId: 'A6' } }),
    });
    s.step({ type: 'TTS_DONE' });
    s.step(heard('one down')); // D1 reads H(soft), _, _, _, _
    s.step({ type: 'TTS_DONE' });
    const out = s.step(heard('about')); // disagrees only with the penciled H
    expect(says(out)[0]).toMatchObject({ kind: 'fit', word: 'ABOUT' });
  });

  test('REQ-ANS-025: "pen" switches back — the ENTER carries no pencil flags again', () => {
    const s = listening(heartSnapshot(undefined, { selection: { clueId: 'A1' } }));
    s.step(heard('pencil'));
    s.step({ type: 'TTS_DONE' });
    expect(says(s.step(heard('pen')))[0]).toEqual({ kind: 'mode-ack', mode: 'pen' });
    s.step({ type: 'TTS_DONE' });
    s.step(heard('heart'));
    const enter = s.step({ type: 'TTS_DONE' })[0];
    expect(enter.cells).toEqual([
      { index: 0, letter: 'H' }, { index: 1, letter: 'E' }, { index: 2, letter: 'A' },
      { index: 3, letter: 'R' }, { index: 4, letter: 'T' },
    ]);
  });

  test('REQ-NAV-013: "six across" jumps to that clue; a missing label is reported', () => {
    const s = listening(heartSnapshot(undefined, { selection: { clueId: 'A1' } }));
    const out = s.step(heard('six across'));
    expect(out.find((a) => a.type === 'SELECT_CLUE').clueId).toBe('A6');
    expect(says(out)[0]).toMatchObject({ kind: 'clue', label: '6 Across' });
    s.step({ type: 'TTS_DONE' });
    expect(says(s.step(heard('twelve down')))[0])
      .toEqual({ kind: 'no-such-clue', number: 12, direction: 'down' });
  });

  test('REQ-NAV-013: "go to six across" navigates via the explicit prefix', () => {
    const s = listening(heartSnapshot(undefined, { selection: { clueId: 'A1' } }));
    const out = s.step(heard('go to six across'));
    expect(out.find((a) => a.type === 'SELECT_CLUE').clueId).toBe('A6');
    expect(says(out)[0]).toMatchObject({ kind: 'clue', label: '6 Across' });
  });

  test('REQ-NAV-013: "go to" without a direction asks for the label, never answers', () => {
    const s = listening(heartSnapshot(undefined, { selection: { clueId: 'A1' } }));
    const out = s.step(heard('go to seven'));
    expect(says(out)[0]).toEqual({ kind: 'goto-didnt-catch' });
    expect(out.find((a) => a.type === 'SELECT_CLUE')).toBeUndefined();
  });

  test('REQ-SPCH-010: a pause reset reopens the mic immediately, no chatter', () => {
    const s = listening(heartSnapshot(undefined, { selection: { clueId: 'A1' } }));
    const out = s.step({ type: 'STT_ERROR', code: 'reset', silentMs: 0 });
    expect(out).toEqual([{ type: 'LISTEN' }]); // no SAY — the ready ping is the only cue
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
