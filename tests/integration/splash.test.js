// @vitest-environment jsdom
// The pre-puzzle splash (REQ-LIFE-016) vs. the fake NYT page: found and clicked away
// when it behaves, honestly reported when it doesn't, invisible when absent. The
// fixture renders the live pz-moment shape; extra cases pin the legacy xwd__ shape
// and the text-anchored net that survives the next class rename.

import { describe, test, expect } from 'vitest';
import { initFakeNyt } from '../fixtures/fake-nyt/fake-app.js';
import { FIXTURE_PUZZLE } from '../fixtures/fake-nyt/puzzle.js';
import { dismissSplash, findSplashPlayButton, waitForSplashClear } from '../../extension/src/page-adapter/splash.js';

describe('splash screen', () => {
  test('REQ-LIFE-016: no splash → nothing to do, reports clear', async () => {
    initFakeNyt(document, FIXTURE_PUZZLE);
    expect(findSplashPlayButton(document)).toBeNull();
    await expect(dismissSplash(document, { waitMs: 50, pollMs: 5 })).resolves.toBe(true);
  });

  test('REQ-LIFE-016: clicks Play on the pz-moment splash and reports clear once the veil drops', async () => {
    initFakeNyt(document, FIXTURE_PUZZLE, { splash: true });
    expect(findSplashPlayButton(document)).toBeTruthy();
    await expect(dismissSplash(document, { waitMs: 500, pollMs: 5 })).resolves.toBe(true);
    expect(findSplashPlayButton(document)).toBeNull();
  });

  test('REQ-LIFE-016: a splash that ignores synthetic clicks is reported, not lied about', async () => {
    initFakeNyt(document, FIXTURE_PUZZLE, { splash: 'stuck' });
    await expect(dismissSplash(document, { waitMs: 60, pollMs: 5 })).resolves.toBe(false);
    // …and waitForSplashClear resolves the moment the user clears it themselves.
    const waiting = waitForSplashClear(document, { waitMs: 500, pollMs: 5 });
    document.querySelector('.pz-moment__container').remove();
    await expect(waiting).resolves.toBe(true);
  });

  test('REQ-LIFE-016: the legacy xwd__modal shape is still recognized', () => {
    initFakeNyt(document, FIXTURE_PUZZLE);
    const veil = document.createElement('div');
    veil.className = 'xwd__modal';
    veil.innerHTML = '<h2>Ready to start solving?</h2><button>Play</button>';
    document.body.append(veil);
    expect(findSplashPlayButton(document)?.textContent).toBe('Play');
    veil.remove();
  });

  test('REQ-LIFE-016: an unknown class family is caught by the headline text net', () => {
    initFakeNyt(document, FIXTURE_PUZZLE);
    const veil = document.createElement('div');
    veil.className = 'shiny-new-shell__overlay'; // no xwd__, no pz-moment
    veil.innerHTML = '<div><h2><span>Ready to start solving?</span></h2></div><button aria-label="Play">▶</button>';
    document.body.append(veil);
    expect(findSplashPlayButton(document)).toBeTruthy();
    veil.remove();
  });

  test('REQ-LIFE-016: the phrase inside server-rendered JSON is NOT a splash', () => {
    initFakeNyt(document, FIXTURE_PUZZLE);
    const script = document.createElement('script');
    script.type = 'application/json';
    script.textContent = '{"moment":"Ready to start solving?"}';
    document.body.append(script);
    expect(findSplashPlayButton(document)).toBeNull();
    script.remove();
  });

  test('REQ-LIFE-016: a splash hidden with display:none reads as already clear', () => {
    initFakeNyt(document, FIXTURE_PUZZLE, { splash: true });
    document.querySelector('.pz-moment__container').style.display = 'none';
    expect(findSplashPlayButton(document)).toBeNull();
  });
});
