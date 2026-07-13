// Orchestrator shell: the silence clock (REQ-CMD-005). The machine is pure, so the
// shell measures how long nothing has been heard and passes `silentMs` with each
// no-speech error; hearing speech or user page activity resets the clock.

import { describe, test, expect } from 'vitest';
import { createOrchestrator } from '../../extension/src/app/orchestrator.js';
import { SILENCE_TIMEOUT_MS } from '../../extension/src/conversation/machine.js';
import { heartSnapshot, SOLVED_HEART_ROWS } from '../helpers/snapshots.js';

/**
 * Boots an orchestrator against fakes and a manual clock. `listenScript` is a list
 * of functions run per listen cycle; each may advance the clock and returns the
 * stt result for that cycle. Resolves when the session ends.
 */
function runSession(listenScript) {
  const clock = { t: 0 };
  const spoken = [];
  let listens = 0;
  let micStops = 0;
  let keepAlives = 0;
  let offs = 0;
  let plays = 0;
  let pageEventCb = null;
  const emitPageEvent = (kind, snapshot) => pageEventCb?.(kind, snapshot);

  const done = new Promise((resolve) => {
    const orchestrator = createOrchestrator({
      now: () => clock.t,
      tts: {
        speak: async (text) => { spoken.push(text); },
        cancel: () => {},
      },
      stt: {
        listenOnce: async () => {
          listens += 1;
          const step = listenScript.shift();
          if (!step) throw new Error('listen cycle beyond the scripted ones');
          return step({ clock, emitPageEvent, micStops: () => micStops });
        },
        stop: () => { micStops += 1; },
      },
      ping: { play: () => { plays += 1; }, off: () => { offs += 1; }, dispose: () => {} },
      pageClient: {
        snapshot: async () => heartSnapshot(undefined, { selection: { clueId: 'A1' } }),
        watch: (cb) => { pageEventCb = cb; },
        unwatch: () => { pageEventCb = null; },
        keepAlive: () => { keepAlives += 1; },
      },
      onEnd: () => resolve(null),
    });
    void orchestrator.start();
  });

  return done.then(() => ({
    spoken, listens: () => listens, micStops: () => micStops,
    keepAlives: () => keepAlives, offs: () => offs, plays: () => plays,
  }));
}

const noSpeech = { error: 'no-speech' };

describe('orchestrator silence clock (REQ-CMD-005)', () => {
  test('quiet cycles accumulate; at the timeout the session ends without a word', async () => {
    const { spoken, listens } = await runSession([
      ({ clock }) => { clock.t += 30_000; return noSpeech; }, // 30 s silent → keep listening
      ({ clock }) => { clock.t += 30_000; return noSpeech; }, // 60 s total → silent end
    ]);
    expect(listens()).toBe(2);
    expect(spoken).toHaveLength(1); // only the opening clue readout — no nagging, no goodbye
  });

  test('heard speech resets the clock', async () => {
    const { spoken } = await runSession([
      ({ clock }) => { clock.t += 50_000; return noSpeech; },
      ({ clock }) => { // user finally says "repeat" — clock restarts here
        clock.t += 9_000;
        return { alternatives: [{ transcript: 'repeat', confidence: 0.9 }] };
      },
      ({ clock }) => { clock.t += 30_000; return noSpeech; }, // 30 s since speech: still alive
      ({ clock }) => { clock.t += SILENCE_TIMEOUT_MS; return noSpeech; }, // now it ends
    ]);
    expect(spoken).toHaveLength(2); // opening clue + the repeat readout
  });

  test('user activity on the page counts as presence and resets the clock', async () => {
    const { listens } = await runSession([
      ({ clock, emitPageEvent }) => { // 70 s of quiet, but the user clicks the grid
        clock.t += 70_000;
        emitPageEvent('selection', heartSnapshot(undefined, { selection: { clueId: 'A1' } }));
        return noSpeech; // measured from the click: 0 s silent → keep listening
      },
      ({ clock }) => { clock.t += SILENCE_TIMEOUT_MS; return noSpeech; },
    ]);
    expect(listens()).toBe(2); // the 70 s cycle did NOT end the session
  });

  test('REQ-SPCH-010: the reset reopen is silent — no ready ping, only the first turn pings', async () => {
    const { plays, listens } = await runSession([
      () => ({ error: 'reset' }), // LISTEN #1 (post-readout) pinged; a mid-utterance reset follows
      ({ clock }) => { clock.t += SILENCE_TIMEOUT_MS; return noSpeech; }, // silent reopen, then quiet end
    ]);
    expect(listens()).toBe(2);
    expect(plays()).toBe(1); // only the handed-turn opening pinged; the reset reopen stayed silent
  });

  test('REQ-LIFE-017: a heard command keeps the puzzle alive; silence sends no nudge', async () => {
    const { keepAlives } = await runSession([
      ({ clock }) => { clock.t += 10_000; return { alternatives: [{ transcript: 'repeat', confidence: 0.9 }] }; },
      ({ clock }) => { clock.t += 10_000; return noSpeech; }, // no command → no nudge
      ({ clock }) => { clock.t += SILENCE_TIMEOUT_MS; return noSpeech; },
    ]);
    expect(keepAlives()).toBe(1); // one nudge for the one heard command; no-speech is silent
  });

  test('REQ-LIFE-017/011: NYT pausing the puzzle ends the session with a tiny blip', async () => {
    const { offs, listens } = await runSession([
      ({ emitPageEvent }) => {
        // The in-page watcher reports NYT's pause (idle-out or look-away).
        emitPageEvent('paused', heartSnapshot(undefined, { selection: { clueId: 'A1' } }));
        return noSpeech;
      },
    ]);
    expect(offs()).toBe(1); // the blip played…
    expect(listens()).toBe(1); // …and the session ended — no further mic cycles
  });

  test('a click the machine absorbs (same clue) never stops the mic — no deaf sessions', async () => {
    let stopsCausedByClick = -1;
    await runSession([
      ({ emitPageEvent, micStops }) => {
        // Same-clue selection: the machine absorbs it with no follow-up LISTEN, so the
        // shell must leave the in-flight cycle running (stopping = deaf with badge ON).
        const before = micStops();
        emitPageEvent('selection', heartSnapshot(undefined, { selection: { clueId: 'A1' } }));
        stopsCausedByClick = micStops() - before;
        return { alternatives: [{ transcript: 'goodbye', confidence: 0.9 }] };
      },
    ]);
    expect(stopsCausedByClick).toBe(0); // not aborted for the absorbed click
  });
});

const deferred = () => {
  let resolve;
  const p = new Promise((r) => { resolve = r; });
  return { p, resolve };
};

describe('click mid-readout (REQ-NAV-008)', () => {
  test('clicking another clue cancels the running readout and reads the clicked clue', async () => {
    const spoken = [];
    const cancelLog = [];
    const readout = deferred(); // the opening A1 readout, held in-flight
    let speaks = 0;
    let listening = false; // set by ui.listening — distinguishes the real LISTEN from barge-in cycles
    let pendingBarge = null;
    let emitPageEvent = null;
    const ended = new Promise((resolve) => {
      const orchestrator = createOrchestrator({
        tts: {
          speak: (text) => {
            spoken.push(text);
            speaks += 1;
            return speaks === 1 ? readout.p : Promise.resolve();
          },
          cancel: () => {
            cancelLog.push(spoken.length); // record WHEN the cut happened
            readout.resolve();
          },
        },
        stt: {
          listenOnce: () => {
            if (listening) { // the post-readout LISTEN: end the session
              return Promise.resolve({ alternatives: [{ transcript: 'goodbye', confidence: 0.9 }] });
            }
            return new Promise((res) => { pendingBarge = res; }); // barge-in cycle: quiet mic
          },
          stop: () => {
            pendingBarge?.({ error: 'aborted' });
            pendingBarge = null;
          },
        },
        ui: { listening: (on) => { listening = on; } },
        pageClient: {
          snapshot: async () => heartSnapshot(undefined, { selection: { clueId: 'A1' } }),
          watch: (cb) => { emitPageEvent = cb; },
          unwatch: () => { emitPageEvent = null; },
        },
        onEnd: () => resolve(null),
      });
      void orchestrator.start();
    });

    // Give the opening readout a beat to start, then click 2 Down on the page.
    await new Promise((r) => setTimeout(r, 0));
    emitPageEvent('selection', heartSnapshot(undefined, { selection: { clueId: 'D2' } }));
    await ended;

    // The A1 readout was cancelled while it was the only utterance so far...
    expect(cancelLog[0]).toBe(1);
    // ...and the very next thing spoken was the clicked clue, then the sign-off.
    expect(spoken[1]).toContain('Glowing coal'); // D2's clue text
    expect(spoken[2]).toContain('Goodbye');
  });

  test('rapid clicks: superseded selections never produce a readout — only the last click is read', async () => {
    const spoken = [];
    const readout = deferred(); // the opening A1 readout, held in-flight
    let speaks = 0;
    let listening = false;
    let pendingBarge = null;
    let emitPageEvent = null;
    const ended = new Promise((resolve) => {
      const orchestrator = createOrchestrator({
        tts: {
          speak: (text) => {
            spoken.push(text);
            speaks += 1;
            return speaks === 1 ? readout.p : Promise.resolve();
          },
          cancel: () => readout.resolve(),
        },
        stt: {
          listenOnce: () => {
            if (listening) { // the real post-readout LISTEN: end the session
              return Promise.resolve({ alternatives: [{ transcript: 'goodbye', confidence: 0.9 }] });
            }
            return new Promise((res) => { pendingBarge = res; }); // barge-in cycle: quiet mic
          },
          stop: () => {
            pendingBarge?.({ error: 'aborted' });
            pendingBarge = null;
          },
        },
        ui: { listening: (on) => { listening = on; } },
        pageClient: {
          snapshot: async () => heartSnapshot(undefined, { selection: { clueId: 'A1' } }),
          watch: (cb) => { emitPageEvent = cb; },
          unwatch: () => { emitPageEvent = null; },
        },
        onEnd: () => resolve(null),
      });
      void orchestrator.start();
    });

    // Two clicks land back-to-back while the opening readout is still playing:
    // first 2 Down, then 6 Across. Only the LAST click should ever be read.
    await new Promise((r) => setTimeout(r, 0));
    emitPageEvent('selection', heartSnapshot(undefined, { selection: { clueId: 'D2' } }));
    emitPageEvent('selection', heartSnapshot(undefined, { selection: { clueId: 'A6' } }));
    await ended;

    expect(spoken.some((s) => s.includes('Glowing coal'))).toBe(false); // D2 was superseded
    expect(spoken[1]).toContain('Dying fire bit'); // A6, the last click
    expect(spoken[2]).toContain('Goodbye');
  });
});

describe('stop-only barge-in (REQ-CMD-006)', () => {

  test('"stop" heard mid-speech cancels the utterance and the session signs off', async () => {
    const spoken = [];
    const readout = deferred(); // the opening clue readout, held in-flight
    let speaks = 0;
    const ended = new Promise((resolve) => {
      const orchestrator = createOrchestrator({
        tts: {
          speak: (text) => {
            spoken.push(text);
            speaks += 1;
            return speaks === 1 ? readout.p : Promise.resolve();
          },
          cancel: () => readout.resolve(), // cancelling ends the in-flight utterance
        },
        stt: {
          // Only the barge-in listener ever runs: it hears "stop" during the readout.
          listenOnce: async () => ({ alternatives: [{ transcript: 'stop', confidence: 0.9 }] }),
          stop: () => {},
        },
        pageClient: {
          snapshot: async () => heartSnapshot(undefined, { selection: { clueId: 'A1' } }),
          watch: () => {},
          unwatch: () => {},
        },
        onEnd: () => resolve(null),
      });
      void orchestrator.start();
    });
    await ended;
    expect(spoken).toHaveLength(2); // the (cut-short) readout + the sign-off
    expect(spoken[1]).toContain('Goodbye');
  });

  test('REQ-SPCH-005: our own voice echoed into the mic is discarded, readout continues', async () => {
    const spoken = [];
    const readout = deferred();
    let speaks = 0;
    let listenCalls = 0;
    let listening = false;
    let pendingBarge = null;
    const ended = new Promise((resolve) => {
      const orchestrator = createOrchestrator({
        tts: {
          speak: (text) => {
            spoken.push(text);
            speaks += 1;
            return speaks === 1 ? readout.p : Promise.resolve();
          },
          cancel: () => {},
        },
        stt: {
          listenOnce: () => {
            if (listening) { // the real post-readout LISTEN: end the session
              return Promise.resolve({ alternatives: [{ transcript: 'goodbye', confidence: 0.9 }] });
            }
            listenCalls += 1;
            // 1st barge cycle: the mic hears the extension reading the clue (echo).
            if (listenCalls === 1) {
              return Promise.resolve({ alternatives: [{ transcript: 'organ with four chambers', confidence: 0.8 }] });
            }
            // 2nd cycle: quiet while the readout finishes naturally.
            return new Promise((res) => {
              pendingBarge = res;
              queueMicrotask(() => readout.resolve());
            });
          },
          stop: () => {
            pendingBarge?.({ error: 'aborted' });
            pendingBarge = null;
          },
        },
        ui: { listening: (on) => { listening = on; } },
        pageClient: {
          snapshot: async () => heartSnapshot(undefined, { selection: { clueId: 'A1' } }),
          watch: () => {},
          unwatch: () => {},
        },
        onEnd: () => resolve(null),
      });
      void orchestrator.start();
    });
    await ended;
    // The echo produced no answer flow: only the full readout and the goodbye spoke.
    expect(spoken).toHaveLength(2);
    expect(spoken[1]).toContain('Goodbye');
  });

  test('REQ-SPCH-005(b): native echo mode lets an echo-like utterance barge in, not filtered', async () => {
    // The SAME utterance the guard test above discards as our own voice must, in 'native'
    // mode, be treated as real barge-in input — the toggle's whole point (headphone users
    // rely on the browser's echo cancellation, so the app-level filter is off).
    const spoken = [];
    const readout = deferred();
    let speaks = 0;
    let listening = false;
    let cancels = 0;
    const heard = [];
    const ended = new Promise((resolve) => {
      const orchestrator = createOrchestrator({
        settings: { echoMode: 'native' },
        tts: {
          speak: (text) => {
            spoken.push(text);
            speaks += 1;
            return speaks === 1 ? readout.p : Promise.resolve(); // only the readout is held open
          },
          cancel: () => { cancels += 1; readout.resolve(); }, // a real cancel ends the utterance
        },
        stt: {
          listenOnce: () => {
            if (listening) { // the real post-barge LISTEN: end the session
              return Promise.resolve({ alternatives: [{ transcript: 'goodbye', confidence: 0.9 }] });
            }
            // Barge cycle during the readout: the mic hears a chunk of our own words.
            return Promise.resolve({ alternatives: [{ transcript: 'organ with four chambers', confidence: 0.8 }] });
          },
          stop: () => {},
        },
        ui: {
          listening: (on) => { listening = on; },
          caption: (role, text) => { if (role === 'heard') heard.push(text); },
        },
        pageClient: {
          snapshot: async () => heartSnapshot(undefined, { selection: { clueId: 'A1' } }),
          watch: () => {},
          unwatch: () => {},
        },
        onEnd: () => resolve(null),
      });
      void orchestrator.start();
    });
    await ended;
    // Not filtered: it cut the readout short and was surfaced as heard input.
    expect(cancels).toBeGreaterThan(0);
    expect(heard).toContain('organ with four chambers');
  });

  test('REQ-SPCH-005: a short NON-command fragment of the prompt is still echo', async () => {
    const spoken = [];
    const readout = deferred();
    let speaks = 0;
    let listenCalls = 0;
    let listening = false;
    let pendingBarge = null;
    const ended = new Promise((resolve) => {
      const orchestrator = createOrchestrator({
        tts: {
          speak: (text) => {
            spoken.push(text);
            speaks += 1;
            return speaks === 1 ? readout.p : Promise.resolve();
          },
          cancel: () => {},
        },
        stt: {
          listenOnce: () => {
            if (listening) { // the real post-readout LISTEN: end the session
              return Promise.resolve({ alternatives: [{ transcript: 'goodbye', confidence: 0.9 }] });
            }
            listenCalls += 1;
            // 1st barge cycle: a SHORT fragment of our own readout ("organ" — 5
            // letters, below the substantial-chunk threshold, not a command).
            if (listenCalls === 1) {
              return Promise.resolve({ alternatives: [{ transcript: 'organ', confidence: 0.8 }] });
            }
            // 2nd cycle: quiet while the readout finishes naturally.
            return new Promise((res) => {
              pendingBarge = res;
              queueMicrotask(() => readout.resolve());
            });
          },
          stop: () => {
            pendingBarge?.({ error: 'aborted' });
            pendingBarge = null;
          },
        },
        ui: { listening: (on) => { listening = on; } },
        pageClient: {
          snapshot: async () => heartSnapshot(undefined, { selection: { clueId: 'A1' } }),
          watch: () => {},
          unwatch: () => {},
        },
        onEnd: () => resolve(null),
      });
      void orchestrator.start();
    });
    await ended;
    // "organ" was discarded as echo — the readout played to the end, then goodbye.
    expect(spoken).toHaveLength(2);
    expect(spoken[1]).toContain('Goodbye');
  });

  test('REQ-SPCH-005: "second" barged into the "First or second?" prompt is the reply, not echo', async () => {
    const spoken = [];
    const askPrompt = deferred(); // the disambiguation prompt, held in-flight
    const entered = [];
    let listening = false;
    let formalListens = 0;
    const ended = new Promise((resolve) => {
      const orchestrator = createOrchestrator({
        tts: {
          speak: (text) => {
            spoken.push(text);
            // Hold only the "First or second?" prompt open so the user can barge into it.
            return text.includes('First or second') ? askPrompt.p : Promise.resolve();
          },
          cancel: () => askPrompt.resolve(),
        },
        stt: {
          listenOnce: () => {
            if (listening) { // formal LISTEN cycles
              formalListens += 1;
              return Promise.resolve(formalListens === 1
                ? { alternatives: [{ transcript: 'plain', confidence: 0.9 }] } // ambiguous: PLAIN / PLANE
                : { alternatives: [{ transcript: 'goodbye', confidence: 0.9 }] });
            }
            // Barge-in cycle during the disambiguation prompt: the user picks "second" —
            // a word that literally appears in the prompt being spoken.
            return Promise.resolve({ alternatives: [{ transcript: 'second', confidence: 0.9 }] });
          },
          stop: () => {},
        },
        ui: { listening: (on) => { listening = on; } },
        pageClient: {
          // A1 is .L... — "plain" fits ambiguously as PLAIN or PLANE, so we ask which.
          snapshot: async () => heartSnapshot(['.L...', '.....', '.....', '.....', '.....'], { selection: { clueId: 'A1' } }),
          enterAnswer: async (cells) => {
            entered.push(cells.map((c) => c.letter).join(''));
            return {
              ok: true,
              snapshot: heartSnapshot(['PLANE', '.....', '.....', '.....', '.....'], { selection: { clueId: 'A1' } }),
            };
          },
          selectClue: async () => ({ ok: true }),
          watch: () => {},
          unwatch: () => {},
        },
        onEnd: () => resolve(null),
      });
      void orchestrator.start();
    });
    await ended;

    // The barged "second" was honored, not discarded as echo: the pick really landed.
    expect(spoken[1]).toContain('First or second');
    expect(spoken[2]).toContain('fits'); // the chosen spelling, entered straight away
    expect(entered).toHaveLength(1);
    expect(spoken[3]).toContain('Dying fire bit'); // conversation moved on to 6 Across
    expect(spoken[4]).toContain('Goodbye');
  });

  test('REQ-SPCH-009: an answer mid-readout cuts the speech and runs the fit flow', async () => {
    const spoken = [];
    const readout = deferred();
    let speaks = 0;
    let listening = false;
    let barged = false;
    const entered = [];
    const ended = new Promise((resolve) => {
      const orchestrator = createOrchestrator({
        tts: {
          speak: (text) => {
            spoken.push(text);
            speaks += 1;
            return speaks === 1 ? readout.p : Promise.resolve();
          },
          cancel: () => readout.resolve(),
        },
        stt: {
          listenOnce: () => {
            if (listening) { // real LISTEN on the next clue: end the session
              return Promise.resolve({ alternatives: [{ transcript: 'goodbye', confidence: 0.9 }] });
            }
            barged = true;
            // The user answers while the opening readout is still playing.
            return Promise.resolve({ alternatives: [{ transcript: 'heart', confidence: 0.9 }] });
          },
          stop: () => {},
        },
        ui: { listening: (on) => { listening = on; } },
        pageClient: {
          snapshot: async () => heartSnapshot(undefined, { selection: { clueId: 'A1' } }),
          enterAnswer: async (cells) => {
            entered.push(cells.map((c) => c.letter).join(''));
            return {
              ok: true,
              snapshot: heartSnapshot(['HEART', '.....', '.....', '.....', '.....'], { selection: { clueId: 'A1' } }),
            };
          },
          selectClue: async () => ({ ok: true }),
          watch: () => {},
          unwatch: () => {},
        },
        onEnd: () => resolve(null),
      });
      void orchestrator.start();
    });
    await ended;
    expect(barged).toBe(true);
    expect(entered).toEqual(['HEART']); // the barged answer really landed
    // Cut readout → "Fits!" → next clue readout → goodbye.
    expect(spoken[1]).toBe('Fits!');
    expect(spoken[2]).toContain('Dying fire bit'); // 6 Across follows
    expect(spoken[3]).toContain('Goodbye');
  });
});

describe('the full-grid verdict popup (REQ-LIFE-005/REQ-LIFE-006)', () => {
  // Boots a session on a grid one word short, answers it, and controls what the page
  // reports: enterAnswer returns the FULL grid still 'active' (NYT rules a beat late,
  // with a popup), each verdict poll answers with `verdict`, and `ruledWrong` scripts
  // the "Keep trying" popup.
  function runFinalEntry({ verdict, script, ruledWrong, timings }) {
    const spoken = [];
    let snapshots = 0;
    let polls = 0;
    let dismissed = 0;
    const lastRows = ['HEART', 'EMBER', 'ABUSE', 'RESIN', 'TREN.'];
    const fullActive = () => heartSnapshot(SOLVED_HEART_ROWS, { selection: { clueId: 'A9' } });
    const ended = new Promise((resolve) => {
      const orchestrator = createOrchestrator({
        tts: { speak: async (text) => { spoken.push(text); }, cancel: () => {} },
        stt: {
          listenOnce: async () => {
            const step = script.shift();
            if (!step) throw new Error('listen cycle beyond the scripted ones');
            return step;
          },
          stop: () => {},
        },
        pageClient: {
          snapshot: async () => {
            snapshots += 1;
            // Call #1 serves the session START; later calls are the verdict polls
            // (and the post-dismiss refresh).
            if (snapshots === 1) return heartSnapshot(lastRows, { selection: { clueId: 'A9' } });
            polls += 1;
            return verdict();
          },
          enterAnswer: async () => ({ ok: true, snapshot: fullActive() }),
          selectClue: async () => ({ ok: true }),
          ruledWrong,
          dismissVerdict: async () => { dismissed += 1; return true; },
          watch: () => {},
          unwatch: () => {},
        },
        timings,
        onEnd: () => resolve(null),
      });
      void orchestrator.start();
    });
    return ended.then(() => ({ spoken, polls: () => polls, dismissed: () => dismissed }));
  }

  test('the congrats popup means a win — no "full but wrong" cry first', async () => {
    const { spoken, dismissed } = await runFinalEntry({
      verdict: () => heartSnapshot(SOLVED_HEART_ROWS, { status: 'solved' }),
      ruledWrong: async () => false,
      timings: { verdictPollMs: 10 },
      script: [{ alternatives: [{ transcript: 'trend', confidence: 0.9 }] }],
    });
    expect(spoken.join(' ')).not.toContain('full');
    expect(spoken.join(' ').toLowerCase()).toContain('hooray');
    expect(dismissed()).toBe(0); // nothing to click away — the win owns the screen
  });

  test('the "Keep trying" popup means full-but-wrong: announced AND clicked away', async () => {
    const { spoken, polls, dismissed } = await runFinalEntry({
      verdict: () => heartSnapshot(SOLVED_HEART_ROWS, { selection: { clueId: 'A9' } }),
      ruledWrong: async () => true, // the popup is already up when we look
      script: [
        { alternatives: [{ transcript: 'trend', confidence: 0.9 }] },
        { alternatives: [{ transcript: 'goodbye', confidence: 0.9 }] },
      ],
    });
    expect(spoken.join(' ')).toContain('full');
    expect(dismissed()).toBe(1); // the board is usable again for the fix-up
    expect(polls()).toBe(1); // no timer-waiting — just the post-dismiss refresh
  });

  test('a page that never rules still gets the honest coaching after the bounded wait', async () => {
    const { spoken, polls } = await runFinalEntry({
      verdict: () => heartSnapshot(SOLVED_HEART_ROWS, { selection: { clueId: 'A9' } }),
      ruledWrong: async () => false,
      timings: { verdictPolls: 3, verdictPollMs: 10 },
      script: [
        { alternatives: [{ transcript: 'trend', confidence: 0.9 }] },
        { alternatives: [{ transcript: 'goodbye', confidence: 0.9 }] },
      ],
    });
    expect(spoken.join(' ')).toContain('full');
    expect(polls()).toBe(3 + 1); // the bounded polls, plus the post-dismiss refresh
  });
});

// ---- Diagnostics plumbing: the entries only the shell can produce (REQ-DIAG-002) ----

describe('diagnostics plumbing (REQ-DIAG-002)', () => {
  // Boots against fakes with a diag sink. `script` supplies successive listenOnce
  // results; when it runs dry, cycles resolve 'aborted' (which the machine ignores),
  // parking the session until stop() is called.
  function boot({ settings, script = [] } = {}) {
    const diag = [];
    const phrasesSeen = [];
    let pageEventCb = null;
    let orchestrator = null;
    const ended = new Promise((resolve) => {
      orchestrator = createOrchestrator({
        now: () => 0,
        tts: { speak: async () => {}, cancel: () => {} },
        stt: {
          listenOnce: async ({ phrases } = {}) => {
            phrasesSeen.push(phrases ?? []);
            return script.shift() ?? { error: 'aborted' };
          },
          stop: () => {},
        },
        settings,
        pageClient: {
          snapshot: async () => heartSnapshot(undefined, { selection: { clueId: 'A1' } }),
          watch: (cb) => { pageEventCb = cb; },
          unwatch: () => { pageEventCb = null; },
          keepAlive: () => {},
        },
        ui: { diag: (entry) => diag.push(entry) },
        onEnd: () => resolve(null),
      });
    });
    // Bounded settle: wait for the async event queue to reach a condition, then assert.
    const until = async (cond) => {
      for (let i = 0; i < 100 && !cond(); i++) await new Promise((r) => setTimeout(r, 0));
    };
    return { orchestrator, diag, phrasesSeen, ended, until, emit: (k, s) => pageEventCb?.(k, s) };
  }

  test('said entries carry the say payload, never the rendered sentence', async () => {
    const { orchestrator, diag, until, ended } = boot();
    await orchestrator.start();
    await until(() => diag.some((e) => e.kind === 'said'));
    const said = diag.find((e) => e.kind === 'said');
    expect(said.say.kind).toBe('clue');
    expect(said.say.label).toBe('1 Across');
    expect(said.say.len).toBe(5);
    expect(said.text).toBeUndefined(); // the sentence would blow the issue-link budget
    orchestrator.stop();
    await ended;
  });

  test('letters appearing outside our writes are logged as typed events with the entry', async () => {
    const { orchestrator, diag, until, emit, ended } = boot();
    await orchestrator.start();
    await until(() => diag.some((e) => e.kind === 'said'));
    // The watcher only reports changes we did NOT make (our writes are pause-wrapped),
    // so a grid event with fresh letters is the user typing into 1-Across.
    emit('grid', heartSnapshot(['HE...', '.....', '.....', '.....', '.....'], { selection: { clueId: 'A1' } }));
    await until(() => diag.some((e) => e.kind === 'typed'));
    expect(diag.find((e) => e.kind === 'typed')).toEqual({ kind: 'typed', clueId: 'A1', word: 'HE...' });
    orchestrator.stop();
    await ended;
  });

  test('a typed letter that arrives AS a selection event (NYT auto-advance) is still logged', async () => {
    // The watcher reports one kind per debounced tick, selection shadowing grid — the
    // last letter of a hand-typed word lands together with NYT's cursor move to the next
    // clue. The diff must run for those ticks too, or the signature "voice failed, user
    // typed it" case (issue #43) logs nothing.
    const { orchestrator, diag, until, emit, ended } = boot();
    await orchestrator.start();
    await until(() => diag.some((e) => e.kind === 'said'));
    emit('selection', heartSnapshot(['HEART', '.....', '.....', '.....', '.....'], { selection: { clueId: 'A6' } }));
    await until(() => diag.some((e) => e.kind === 'typed'));
    expect(diag.find((e) => e.kind === 'typed')).toEqual({ kind: 'typed', clueId: 'A1', word: 'HEART' });
    orchestrator.stop();
    await ended;
  });

  test('teardown records the end reason as the final entry, before the record closes', async () => {
    const { orchestrator, diag, until, ended } = boot();
    await orchestrator.start();
    await until(() => diag.some((e) => e.kind === 'said'));
    orchestrator.stop('nyt-pause');
    await ended;
    expect(diag.at(-1)).toEqual({ kind: 'end', reason: 'nyt-pause' });
  });

  test('REQ-SPCH-011: after two failed attempts the next listen cycle is letter-biased', async () => {
    const elephant = { alternatives: [{ transcript: 'elephant', confidence: 0.9 }] };
    const { orchestrator, phrasesSeen, until, ended } = boot({
      settings: { biasing: 'full' },
      script: [elephant, elephant], // two length-mismatches on the 5-entry
    });
    await orchestrator.start();
    await until(() => phrasesSeen.length >= 3);
    const hasLetters = (phrases) => phrases.some((p) => p.phrase === 'juliet');
    expect(hasLetters(phrasesSeen[0])).toBe(false); // 5 open squares, no struggle yet
    expect(hasLetters(phrasesSeen[1])).toBe(false); // one miss — not yet
    expect(hasLetters(phrasesSeen[2])).toBe(true); // two misses — spelling armed
    orchestrator.stop();
    await ended;
  });
});
