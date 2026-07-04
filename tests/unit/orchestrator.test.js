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
