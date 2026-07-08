// @vitest-environment jsdom
// The puzzle stays alive as an intrinsic part of the regular operations (REQ-LIFE-017) —
// prevention, not cure. NYT auto-pauses a quiet puzzle after a stretch with no keyboard
// input; a voice solver isn't typing, so the two page-touching actions carry presence
// themselves: "enter answer" types real keystrokes, and "move" clicks — and clickCell
// pairs every click with a keystroke the page honors, since a synthetic click alone may
// not register with the inactivity watcher. Verified against the fake page's inactivity
// model (autoPause / idleTick), which pauses only when an interval saw no keydown.

import { describe, test, expect } from 'vitest';
import { initFakeNyt } from '../fixtures/fake-nyt/fake-app.js';
import { FIXTURE_PUZZLE } from '../fixtures/fake-nyt/puzzle.js';
import { clickCell, enterAnswer } from '../../extension/src/page-adapter/writer.js';
import { selectClue } from '../../extension/src/page-adapter/navigator.js';
import { snapshot, cellElements } from '../../extension/src/page-adapter/reader.js';

const word = (letters, startIndex, stride) =>
  letters.split('').map((letter, i) => ({ index: startIndex + i * stride, letter }));
const paused = () => document.querySelector('.xwd__modal--pause') != null;

describe('keep-alive (REQ-LIFE-017)', () => {
  test('a quiet puzzle auto-pauses when nothing signals presence', () => {
    const app = initFakeNyt(document, FIXTURE_PUZZLE, { autoPause: true });
    expect(app.idleTick()).toBe(true); // the inactivity timer fires with no activity…
    expect(paused()).toBe(true); // …and the board is veiled
  });

  test('a click carries the puzzle across the inactivity timer', () => {
    const app = initFakeNyt(document, FIXTURE_PUZZLE, { autoPause: true });
    clickCell(cellElements(document)[6]); // the mouse events alone would not count…
    expect(app.idleTick()).toBe(false); // …but the paired keystroke registers as presence
    expect(paused()).toBe(false);
  });

  test('the click keep-alive types no letter and only selects', () => {
    initFakeNyt(document, FIXTURE_PUZZLE);
    clickCell(cellElements(document)[6]);
    expect(snapshot(document).cells[6].letter).toBe(''); // the Shift nudge added nothing
  });

  test('moving to another clue keeps the puzzle alive (REQ-LIFE-017 + REQ-NAV-007)', () => {
    const app = initFakeNyt(document, FIXTURE_PUZZLE, { autoPause: true });
    expect(selectClue(document, 'D2')).toBe(true);
    expect(app.idleTick()).toBe(false); // the move registered as presence
    expect(snapshot(document).selection.clueId).toBe('D2'); // …and it still selected the clue
  });

  test('entering an answer keeps the puzzle alive — real keystrokes, no mouse hack', async () => {
    const app = initFakeNyt(document, FIXTURE_PUZZLE, { autoPause: true });
    await enterAnswer(document, word('HEART', 0, 1));
    expect(app.idleTick()).toBe(false); // the typed keys were presence
    expect(snapshot(document).cells.slice(0, 5).map((c) => c.letter)).toEqual(['H', 'E', 'A', 'R', 'T']);
  });
});
