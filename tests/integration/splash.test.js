// @vitest-environment jsdom
// The pre-puzzle splash (REQ-LIFE-016) vs. the fake NYT page: found and clicked away
// when it behaves, honestly reported when it doesn't, invisible when absent.

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

  test('REQ-LIFE-016: clicks Play and reports clear once the veil drops', async () => {
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
    document.querySelector('.xwd__modal').remove();
    await expect(waiting).resolves.toBe(true);
  });
});
