// @vitest-environment jsdom
// The keep-alive that PREVENTS NYT auto-pausing a quiet puzzle mid-conversation
// (REQ-LIFE-017) — prevention, not cure. User actions send a keyboard-only presence
// nudge so the page's inactivity timer never fires; page writes keep it alive on their
// own by typing real keys. Verified against the fake page's inactivity model
// (autoPause / idleTick), which pauses only when an interval saw no keydown.

import { describe, test, expect } from 'vitest';
import { initFakeNyt } from '../fixtures/fake-nyt/fake-app.js';
import { FIXTURE_PUZZLE } from '../fixtures/fake-nyt/puzzle.js';
import { keepAlive, enterAnswer } from '../../extension/src/page-adapter/writer.js';
import { selectClue } from '../../extension/src/page-adapter/navigator.js';
import { snapshot } from '../../extension/src/page-adapter/reader.js';

const word = (letters, startIndex, stride) =>
  letters.split('').map((letter, i) => ({ index: startIndex + i * stride, letter }));
const paused = () => document.querySelector('.xwd__modal--pause') != null;

describe('keep-alive (REQ-LIFE-017)', () => {
  test('a quiet puzzle auto-pauses when nothing signals presence', () => {
    const app = initFakeNyt(document, FIXTURE_PUZZLE, { autoPause: true });
    expect(app.idleTick()).toBe(true); // the inactivity timer fires with no activity…
    expect(paused()).toBe(true); // …and the board is veiled
  });

  test('a keyboard keep-alive carries the puzzle across the inactivity timer', () => {
    const app = initFakeNyt(document, FIXTURE_PUZZLE, { autoPause: true });
    keepAlive(document);
    expect(app.idleTick()).toBe(false); // presence seen → no pause
    expect(paused()).toBe(false);
  });

  test('keepAlive is keyboard-only: it never types a letter or moves the selection', () => {
    initFakeNyt(document, FIXTURE_PUZZLE);
    const before = snapshot(document);
    keepAlive(document);
    keepAlive(document);
    const after = snapshot(document);
    expect(after.cells).toEqual(before.cells); // no letters landed
    expect(after.selection).toEqual(before.selection); // no cursor moved
  });

  test('entering an answer keeps the puzzle alive on its own — real keystrokes, no mouse hack', async () => {
    const app = initFakeNyt(document, FIXTURE_PUZZLE, { autoPause: true });
    await enterAnswer(document, word('HEART', 0, 1));
    expect(app.idleTick()).toBe(false); // the typed keys were presence
    expect(snapshot(document).cells.slice(0, 5).map((c) => c.letter)).toEqual(['H', 'E', 'A', 'R', 'T']);
  });

  test('moving to another clue keeps the puzzle alive (REQ-LIFE-017 + REQ-NAV-007)', () => {
    const app = initFakeNyt(document, FIXTURE_PUZZLE, { autoPause: true });
    expect(selectClue(document, 'D2')).toBe(true);
    expect(app.idleTick()).toBe(false); // the move registered as presence
    expect(snapshot(document).selection.clueId).toBe('D2'); // …and it still selected the clue
  });
});
