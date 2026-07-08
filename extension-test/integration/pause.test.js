// @vitest-environment jsdom
// The auto-pause veil (REQ-LIFE-017) vs. the fake NYT page: detected while up, resumed
// with a real click, invisible when absent — and never confused with the splash or a
// verdict popup. The fixture renders the live pz-moment shape; extra cases pin the
// legacy xwd__ shape and the text-anchored net that survives the next class rename.

import { describe, test, expect } from 'vitest';
import { initFakeNyt } from '../fixtures/fake-nyt/fake-app.js';
import { FIXTURE_PUZZLE } from '../fixtures/fake-nyt/puzzle.js';
import { isPaused, findResumeButton, resumePuzzle, dismissPause } from '../../extension/src/page-adapter/pause.js';
import { findSplashPlayButton } from '../../extension/src/page-adapter/splash.js';
import { isRuledWrong, snapshot } from '../../extension/src/page-adapter/reader.js';

describe('auto-pause veil', () => {
  test('REQ-LIFE-017: no veil → not paused, nothing to resume', async () => {
    initFakeNyt(document, FIXTURE_PUZZLE);
    expect(isPaused(document)).toBe(false);
    expect(findResumeButton(document)).toBeNull();
    expect(resumePuzzle(document)).toBe(false);
    await expect(dismissPause(document, { waitMs: 50, pollMs: 5 })).resolves.toBe(true);
  });

  test('REQ-LIFE-017: clicks Resume on the pause moment and the entries reappear', async () => {
    const app = initFakeNyt(document, FIXTURE_PUZZLE, { paused: true });
    app.typeAt(0, 'across', 'HEART'); // typing under the veil still lands in state…
    expect(isPaused(document)).toBe(true);
    expect(snapshot(document).cells.slice(0, 5).map((c) => c.letter)).toEqual(['', '', '', '', '']); // …but is veiled
    await expect(dismissPause(document, { waitMs: 500, pollMs: 5 })).resolves.toBe(true);
    expect(isPaused(document)).toBe(false);
    expect(snapshot(document).cells.slice(0, 5).map((c) => c.letter)).toEqual(['H', 'E', 'A', 'R', 'T']); // back on screen
  });

  test('REQ-LIFE-017: the pause veil never reads as a wrong-grid ruling', () => {
    initFakeNyt(document, FIXTURE_PUZZLE, { paused: true });
    expect(isRuledWrong(document)).toBe(false);
    // The splash detector's Play-word net already includes "resume" (REQ-LIFE-016), so it
    // also matches the veil's Resume button — a harmless overlap: dismissSplash runs only
    // at session start, and clicking Resume there reveals the board just as intended.
    expect(findSplashPlayButton(document)?.textContent).toBe('Resume');
  });

  test('REQ-LIFE-017: the splash is never mistaken for a pause veil', () => {
    initFakeNyt(document, FIXTURE_PUZZLE, { splash: true });
    expect(isPaused(document)).toBe(false); // "Ready to start solving?" has no "paused" copy
  });

  test('REQ-LIFE-017: the legacy xwd__modal pause shape is still recognized', () => {
    initFakeNyt(document, FIXTURE_PUZZLE);
    const veil = document.createElement('div');
    veil.className = 'xwd__modal';
    veil.innerHTML = '<h2>Your puzzle is paused</h2><button>Resume</button>';
    document.body.append(veil);
    expect(findResumeButton(document)?.textContent).toBe('Resume');
    veil.remove();
  });

  test('REQ-LIFE-017: an unknown class family is caught by the "paused" text net', () => {
    initFakeNyt(document, FIXTURE_PUZZLE);
    const veil = document.createElement('div');
    veil.className = 'shiny-new-shell__overlay'; // no xwd__, no pz-moment
    veil.innerHTML = '<div><h2><span>Your puzzle is paused</span></h2></div><button aria-label="Resume">▶</button>';
    document.body.append(veil);
    expect(isPaused(document)).toBe(true);
    veil.remove();
  });

  test('REQ-LIFE-017: the word inside server-rendered JSON is NOT a pause veil', () => {
    initFakeNyt(document, FIXTURE_PUZZLE);
    const script = document.createElement('script');
    script.type = 'application/json';
    script.textContent = '{"state":"paused"}';
    document.body.append(script);
    expect(isPaused(document)).toBe(false);
    script.remove();
  });

  test('REQ-LIFE-017: a pause veil hidden with display:none reads as already cleared', () => {
    initFakeNyt(document, FIXTURE_PUZZLE, { paused: true });
    document.querySelector('.xwd__modal--pause').style.display = 'none';
    expect(isPaused(document)).toBe(false);
  });
});
