// Impure shell: executes machine actions via ports, feeds results back as events.
// Strictly sequential (FIFO event queue) — no overlapping speech/listen/writes.

import { initialState, reduce } from '../conversation/machine.js';
import { render } from '../conversation/phrases.js';

/**
 * @param {object} deps
 * @param {{speak(text):Promise, cancel():void}} deps.tts
 * @param {{listenOnce():Promise, stop():void}} deps.stt
 * @param {object} deps.pageClient
 *   {snapshot, enterAnswer(cells), selectClue(clueId), watch(cb), unwatch, pauseWatch, resumeWatch}
 * @param {object} [deps.ui]  {caption(role, text), listening(bool)}
 * @param {() => void} [deps.onEnd]
 * @param {() => number} [deps.now]  clock, injectable for tests
 */
export function createOrchestrator({ tts, stt, pageClient, ui = {}, onEnd = () => {}, now = Date.now }) {
  let state = initialState();
  const queue = [];
  let processing = false;
  let ended = false;
  // REQ-CMD-005: last moment the user was audibly or visibly active. The machine is
  // pure, so the shell measures silence and passes it along with no-speech errors.
  let lastActivityAt = now();

  const caption = (role, text) => ui.caption?.(role, text);

  async function execute(action) {
    switch (action.type) {
      case 'SAY': {
        const text = render(action.say);
        caption('say', text); // REQ-SPCH-007
        await tts.speak(text);
        enqueue({ type: 'TTS_DONE' });
        break;
      }
      case 'LISTEN': {
        ui.listening?.(true);
        const result = await stt.listenOnce();
        ui.listening?.(false);
        if (ended) break;
        if (result.error) {
          enqueue({ type: 'STT_ERROR', code: result.error, silentMs: now() - lastActivityAt });
        } else {
          lastActivityAt = now();
          caption('heard', result.alternatives[0]?.transcript ?? ''); // REQ-SPCH-008
          enqueue({ type: 'HEARD', alternatives: result.alternatives });
        }
        break;
      }
      case 'ENTER': {
        try {
          pageClient.pauseWatch?.(); // our own typing must not look like user activity
          const { ok, snapshot } = await pageClient.enterAnswer(action.cells);
          pageClient.resumeWatch?.();
          enqueue({ type: 'ENTRY_RESULT', ok, snapshot });
        } catch {
          pageLost();
        }
        break;
      }
      case 'SELECT_CLUE': {
        try {
          await pageClient.selectClue(action.clueId);
        } catch {
          pageLost();
        }
        break;
      }
      case 'END':
        teardown();
        break;
      default:
        break;
    }
  }

  function teardown() {
    if (ended) return;
    ended = true;
    tts.cancel();
    stt.stop();
    try {
      pageClient.unwatch?.();
    } catch { /* page already gone */ }
    onEnd();
  }

  function pageLost() {
    // Tab navigated away or closed (REQ-LIFE-008).
    caption('note', 'Lost the puzzle page — ending the session.');
    enqueue({ type: 'TOGGLE_OFF' });
  }

  function enqueue(event) {
    if (ended && event.type !== 'TOGGLE_OFF') return;
    // Interrupt in-flight audio for events that must take effect NOW; the pending
    // LISTEN resolves as 'aborted' (which the machine ignores) and the queue drains.
    if (event.type === 'TOGGLE_OFF') { // REQ-LIFE-002: instant silence
      tts.cancel();
      stt.stop();
    } else if (event.type === 'PAGE_EVENT') {
      // Clicking or typing on the puzzle is user presence — reset the silence clock.
      lastActivityAt = now();
      if (event.kind === 'solved' || event.kind === 'selection') stt.stop();
    }
    queue.push(event);
    void drain();
  }

  async function drain() {
    if (processing) return;
    processing = true;
    while (queue.length) {
      const event = queue.shift();
      const result = reduce(state, event);
      state = result.state;
      for (const action of result.actions) {
        if (ended && action.type !== 'END') continue;
        // eslint-disable-next-line no-await-in-loop
        await execute(action);
      }
    }
    processing = false;
  }

  return {
    async start() {
      lastActivityAt = now(); // session start is user activity (icon click)
      let snap;
      try {
        snap = await pageClient.snapshot();
        pageClient.watch?.((kind, snapshot) => enqueue({ type: 'PAGE_EVENT', kind, snapshot }));
      } catch {
        snap = { status: 'not-found', size: { rows: 0, cols: 0 }, cells: [], clues: [], selection: {} };
      }
      enqueue({ type: 'START', snapshot: snap });
    },
    stop() {
      enqueue({ type: 'TOGGLE_OFF' });
    },
    get state() {
      return state;
    },
  };
}
