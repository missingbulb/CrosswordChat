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

describe('stop-only barge-in (REQ-CMD-006)', () => {
  const deferred = () => {
    let resolve;
    const p = new Promise((r) => { resolve = r; });
    return { p, resolve };
  };

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

  test('non-stop speech during TTS is discarded — never treated as an answer (REQ-SPCH-005)', async () => {
    const spoken = [];
    const readout = deferred();
    let speaks = 0;
    let listenCalls = 0;
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
            listenCalls += 1;
            // 1st cycle: mid-speech chatter ("heart" — a would-be answer). 2nd: still
            // speaking, cycle stays open while the readout finishes. 3rd: the real
            // post-speech listen, where the user ends the session.
            if (listenCalls === 1) return Promise.resolve({ alternatives: [{ transcript: 'heart', confidence: 0.9 }] });
            if (listenCalls === 2) {
              return new Promise((res) => {
                pendingBarge = res;
                queueMicrotask(() => readout.resolve()); // readout finishes naturally
              });
            }
            return Promise.resolve({ alternatives: [{ transcript: 'goodbye', confidence: 0.9 }] });
          },
          stop: () => {
            pendingBarge?.({ error: 'aborted' });
            pendingBarge = null;
          },
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
    // "heart" mid-speech produced no fit/enter flow: only the readout and the goodbye spoke.
    expect(spoken).toHaveLength(2);
    expect(spoken[1]).toContain('Goodbye');
    expect(listenCalls).toBe(3);
  });
});
