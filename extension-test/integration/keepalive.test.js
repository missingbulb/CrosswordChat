// @vitest-environment jsdom
// The keep-alive / auto-pause lifecycle (REQ-LIFE-017, REQ-LIFE-011). NYT pauses a quiet
// puzzle ~30s after the last keydown; a voice solver isn't typing, so:
//   - a heard command sends a keystroke that resets NYT's timer (keepAlive), and
//   - when the puzzle DOES pause, the watcher reports it so the session can end.
// Verified against the fake page's inactivity model (autoPause / idleTick, which pauses
// only when an interval saw no keydown) and its "Your puzzle is paused" veil.

import { describe, test, expect } from 'vitest';
import { initFakeNyt } from '../fixtures/fake-nyt/fake-app.js';
import { FIXTURE_PUZZLE } from '../fixtures/fake-nyt/puzzle.js';
import { keepAlive } from '../../extension/src/page-adapter/writer.js';
import { snapshot, isPaused } from '../../extension/src/page-adapter/reader.js';
import { createWatcher } from '../../extension/src/page-adapter/watcher.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

describe('keep-alive (REQ-LIFE-017)', () => {
  test('a quiet puzzle auto-pauses when no command comes', () => {
    const app = initFakeNyt(document, FIXTURE_PUZZLE, { autoPause: true });
    expect(app.idleTick()).toBe(true); // the inactivity timer fires with no keystroke…
    expect(isPaused(document)).toBe(true); // …and the board is veiled
  });

  test('a command keep-alive carries the puzzle across the inactivity timer', () => {
    const app = initFakeNyt(document, FIXTURE_PUZZLE, { autoPause: true });
    keepAlive(document); // what the orchestrator sends on each heard command
    expect(app.idleTick()).toBe(false); // presence seen → no pause
    expect(isPaused(document)).toBe(false);
  });

  test('keepAlive changes neither the grid nor the selection', () => {
    initFakeNyt(document, FIXTURE_PUZZLE);
    const before = snapshot(document);
    keepAlive(document);
    keepAlive(document);
    const after = snapshot(document);
    expect(after.cells).toEqual(before.cells); // no letter typed
    expect(after.selection).toEqual(before.selection); // no cursor moved
  });
});

describe('pause detection (REQ-LIFE-017 / REQ-LIFE-011)', () => {
  test('isPaused sees the veil, and reads clear when it is absent or only in JSON', () => {
    const app = initFakeNyt(document, FIXTURE_PUZZLE);
    expect(isPaused(document)).toBe(false);
    app.showPause();
    expect(isPaused(document)).toBe(true);
    // Hidden veils and the phrase in server-rendered JSON must not count.
    document.querySelector('.xwd__modal--pause').style.display = 'none';
    expect(isPaused(document)).toBe(false);
  });

  test('the phrase in a server-rendered script is not a pause', () => {
    initFakeNyt(document, FIXTURE_PUZZLE);
    const s = document.createElement('script');
    s.type = 'application/json';
    s.textContent = '{"moment":"Your puzzle is paused"}';
    document.body.append(s);
    expect(isPaused(document)).toBe(false);
    s.remove();
  });

  test('the watcher reports paused once when NYT veils the board — not as a grid change', async () => {
    const app = initFakeNyt(document, FIXTURE_PUZZLE);
    app.typeAt(0, 'across', 'HEART'); // an answer is on the board before the pause
    const events = [];
    const watcher = createWatcher(document, (kind) => events.push(kind), { debounceMs: 5 });
    watcher.start();
    app.showPause(); // NYT veils the board mid-session, blanking the entries
    await sleep(40);
    watcher.stop();
    expect(events.filter((k) => k === 'paused')).toHaveLength(1); // reported exactly once
    expect(events).not.toContain('grid'); // the blanked entries were NOT read as a change
  });
});
