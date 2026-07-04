// Impure shell: executes machine actions via ports, feeds results back as events.
// Strictly sequential (FIFO event queue) — no overlapping speech/listen/writes.

import { initialState, reduce } from '../conversation/machine.js';
import { render } from '../conversation/phrases.js';
import { parseCommand } from '../matching/commands.js';
import { toLetters } from '../matching/normalize.js';

/**
 * @param {object} deps
 * @param {{speak(text):Promise, cancel():void}} deps.tts
 * @param {{listenOnce():Promise, stop():void}} deps.stt
 * @param {object} deps.pageClient
 *   {snapshot, enterAnswer(cells), clearEntry(cellIndices), selectClue(clueId),
 *    watch(cb), unwatch, pauseWatch, resumeWatch}
 * @param {object} [deps.ui]  {caption(role, text), listening(bool)}
 * @param {() => void} [deps.onEnd]
 * @param {() => number} [deps.now]  clock, injectable for tests
 * @param {object} [deps.settings]  persisted user settings, e.g. {strategy} (REQ-NAV-012)
 */
export function createOrchestrator({ tts, stt, pageClient, ui = {}, onEnd = () => {}, now = Date.now, settings = {} }) {
  let state = initialState();
  const queue = [];
  let processing = false;
  let ended = false;
  // REQ-CMD-005: last moment the user was audibly or visibly active. The machine is
  // pure, so the shell measures silence and passes it along with no-speech errors.
  let lastActivityAt = now();

  const caption = (role, text) => ui.caption?.(role, text);

  // Barge-in (REQ-SPCH-009): while TTS speaks, keep a mic cycle open. Utterances
  // that read as a chunk of what we're saying are our own voice coming back through
  // the mic — discarded (echo guard, REQ-SPCH-005). Anything else cuts the speech
  // short: full input when this utterance ends in listening, stop only otherwise
  // (REQ-CMD-006 — an answer must not race a pending entry or the sign-off).
  // Returns the event to enqueue instead of TTS_DONE, or null for normal completion.
  async function speakWithBargeIn(text) {
    const spokenLetters = toLetters(text); // echo signature of what WE are saying
    const full = state.after === 'listen'; // phase is 'speaking' whenever a SAY executes
    let speaking = true;
    let interrupt = null;
    const speech = Promise.resolve(tts.speak(text)).then(() => { speaking = false; });
    const watcher = (async () => {
      for (;;) {
        // Yield first: when speak resolves immediately (headless/tests) the mic never opens.
        await Promise.resolve();
        if (!speaking || ended) return;
        const result = await stt.listenOnce();
        if (ended) return;
        if (result.error) {
          if (!speaking) return;
          if (result.error === 'no-speech' || result.error === 'aborted') continue;
          return; // mic trouble — the post-speech LISTEN will surface it properly
        }
        lastActivityAt = now();
        const top = result.alternatives[0]?.transcript ?? '';
        // Echo guard: if ANY alternative reads as a contiguous chunk of the spoken
        // text, the whole utterance is our own voice — ignore it (REQ-SPCH-005).
        const isEcho = result.alternatives.some((a) => {
          const heard = toLetters(a.transcript);
          return heard && spokenLetters.includes(heard);
        });
        if (isEcho || !toLetters(top)) {
          if (!speaking) return;
          continue;
        }
        if (full) {
          caption('heard', top); // REQ-SPCH-008
          interrupt = { type: 'HEARD', alternatives: result.alternatives };
          tts.cancel();
          return;
        }
        if (parseCommand(top)?.command === 'stop') {
          caption('heard', top);
          interrupt = { type: 'BARGE_IN' };
          tts.cancel();
          return;
        }
        if (!speaking) return;
      }
    })();
    await speech;
    stt.stop(); // abort the watcher's in-flight cycle, if any
    await watcher;
    return interrupt;
  }

  async function execute(action) {
    switch (action.type) {
      case 'SAY': {
        const text = render(action.say);
        caption('say', text); // REQ-SPCH-007
        const interrupt = await speakWithBargeIn(text);
        enqueue(interrupt ?? { type: 'TTS_DONE' });
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
      case 'UNDO': {
        // Revert the last entry (REQ-ANS-017): null letters mean "clear the cell",
        // real letters mean "restore what our entry overwrote".
        try {
          pageClient.pauseWatch?.();
          const clears = action.cells.filter((c) => !c.letter).map((c) => c.index);
          const restores = action.cells.filter((c) => c.letter);
          let ok = true;
          let snap = null;
          if (clears.length) ({ ok, snapshot: snap } = await pageClient.clearEntry(clears));
          if (restores.length) {
            const res = await pageClient.enterAnswer(restores);
            ok = ok && res.ok;
            snap = res.snapshot;
          }
          pageClient.resumeWatch?.();
          enqueue({ type: 'UNDO_RESULT', ok, snapshot: snap ?? await pageClient.snapshot() });
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
      if (event.kind === 'selection') {
        // REQ-NAV-008: clicking another clue takes effect NOW — cut any readout short.
        // Our own SELECT_CLUE echoes back with the clue we already track, so it never
        // cancels; neither does a click the machine won't follow (entry in flight).
        const sel = event.snapshot?.selection?.clueId;
        const willFollow = state.phase === 'listening'
          || (state.phase === 'speaking' && state.after === 'listen');
        if (sel && sel !== state.clueId && willFollow) tts.cancel();
      }
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
      enqueue({ type: 'START', snapshot: snap, settings });
    },
    stop() {
      enqueue({ type: 'TOGGLE_OFF' });
    },
    get state() {
      return state;
    },
  };
}
