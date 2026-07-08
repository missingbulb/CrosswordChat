// Page change watcher (REQ-PAGE-010). Session-scoped: created on demand, stopped on
// session end, so the extension is inert when off (REQ-NFR-004).

import { snapshot } from './reader.js';
import { isPaused, resumePuzzle } from './pause.js';

/**
 * @param {Document} document
 * @param {(kind: 'solved'|'selection'|'grid', snap: object) => void} onEvent
 * @param {{debounceMs?: number}} [opts]
 */
export function createWatcher(document, onEvent, { debounceMs = 150 } = {}) {
  let observer = null;
  let timer = null;
  let paused = false;
  let last = snapshot(document);

  // Pencil state counts as grid state: a letter flipping pen↔pencil is a change too.
  const lettersOf = (snap) => snap.cells.map((c) => (c.letter || '.') + (c.penciled ? '*' : '')).join('');

  const check = () => {
    timer = null;
    if (paused) return;
    // NYT auto-pauses (REQ-LIFE-017): it veils the board — and blanks the entries — behind
    // a Resume overlay after a stretch of no keystrokes. During a live session that freeze
    // is spurious (the user is talking, not away), so resume it for them. Bail BEFORE the
    // diff so the veiled, letter-less grid is never read as the user clearing their answers;
    // the resume's repaint re-baselines against the entries that were always there.
    if (isPaused(document)) {
      resumePuzzle(document);
      return;
    }
    const snap = snapshot(document);
    const prev = last;
    last = snap;
    if (prev.status !== 'solved' && snap.status === 'solved') {
      onEvent('solved', snap);
    } else if (snap.selection.clueId !== prev.selection.clueId && snap.selection.clueId) {
      onEvent('selection', snap);
    } else if (lettersOf(snap) !== lettersOf(prev)) {
      onEvent('grid', snap);
    }
  };

  const schedule = () => {
    if (paused || timer != null) return;
    const view = document.defaultView ?? globalThis;
    timer = view.setTimeout(check, debounceMs);
  };

  return {
    start() {
      if (observer) return;
      observer = new (document.defaultView ?? globalThis).MutationObserver(schedule);
      observer.observe(document.body, {
        subtree: true,
        childList: true,
        characterData: true,
        attributes: true,
        attributeFilter: ['class'],
      });
      last = snapshot(document);
    },
    /** Suppress events while WE write, so our typing doesn't look like the user's. */
    pause() {
      paused = true;
    },
    resume() {
      paused = false;
      last = snapshot(document); // re-baseline: our own writes are not "changes"
    },
    stop() {
      observer?.disconnect();
      observer = null;
      if (timer != null) (document.defaultView ?? globalThis).clearTimeout(timer);
      timer = null;
    },
  };
}
