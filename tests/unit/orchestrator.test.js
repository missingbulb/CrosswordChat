// Orchestrator shell: the silence clock (REQ-CMD-005). The machine is pure, so the
// shell measures how long nothing has been heard and passes `silentMs` with each
// no-speech error; hearing speech or user page activity resets the clock.

import { describe, test, expect } from 'vitest';
import { createOrchestrator } from '../../extension/src/app/orchestrator.js';
import { SILENCE_TIMEOUT_MS } from '../../extension/src/conversation/machine.js';
import { heartSnapshot } from '../helpers/snapshots.js';

/**
 * Boots an orchestrator against fakes and a manual clock. `listenScript` is a list
 * of functions run per listen cycle; each may advance the clock and returns the
 * stt result for that cycle. Resolves when the session ends.
 */
function runSession(listenScript) {
  const clock = { t: 0 };
  const spoken = [];
  let listens = 0;
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
          return step({ clock, emitPageEvent });
        },
        stop: () => {},
      },
      pageClient: {
        snapshot: async () => heartSnapshot(undefined, { selection: { clueId: 'A1' } }),
        watch: (cb) => { pageEventCb = cb; },
        unwatch: () => { pageEventCb = null; },
      },
      onEnd: () => resolve(null),
    });
    void orchestrator.start();
  });

  return done.then(() => ({ spoken, listens: () => listens }));
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

  test('REQ-SPCH-005: "yes" barged into the "Yes or no." prompt is the reply, not echo', async () => {
    const spoken = [];
    const confirmPrompt = deferred(); // the replace-confirm prompt, held in-flight
    const entered = [];
    let listening = false;
    let formalListens = 0;
    const ended = new Promise((resolve) => {
      const orchestrator = createOrchestrator({
        tts: {
          speak: (text) => {
            spoken.push(text);
            // Hold only the replace-confirm prompt open so the user can barge into it.
            return text.includes('Yes or no') ? confirmPrompt.p : Promise.resolve();
          },
          cancel: () => confirmPrompt.resolve(),
        },
        stt: {
          listenOnce: () => {
            if (listening) { // formal LISTEN cycles
              formalListens += 1;
              return Promise.resolve(formalListens === 1
                ? { alternatives: [{ transcript: 'panda', confidence: 0.9 }] } // triggers replace-confirm
                : { alternatives: [{ transcript: 'goodbye', confidence: 0.9 }] });
            }
            // Barge-in cycle during the confirm prompt: the user answers "yes" —
            // a word that literally appears in the prompt being spoken.
            return Promise.resolve({ alternatives: [{ transcript: 'yes', confidence: 0.9 }] });
          },
          stop: () => {},
        },
        ui: { listening: (on) => { listening = on; } },
        pageClient: {
          // A1 already reads HEART, so a fitting new answer asks for confirmation.
          snapshot: async () => heartSnapshot(['HEART', '.....', '.....', '.....', '.....'], { selection: { clueId: 'A1' } }),
          enterAnswer: async (cells) => {
            entered.push(cells.map((c) => c.letter).join(''));
            return {
              ok: true,
              snapshot: heartSnapshot(['PANDA', '.....', '.....', '.....', '.....'], { selection: { clueId: 'A1' } }),
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

    // The barged "yes" was honored: the replacement really landed.
    expect(spoken[1]).toContain('Yes or no');
    expect(spoken[2]).toContain('entering Panda');
    expect(entered).toEqual(['PANDA']);
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
