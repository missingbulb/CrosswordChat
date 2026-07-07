// Supported-URL matcher (REQ-LIFE-013): drives the per-tab action icon and the
// unsupported-site popup (REQ-LIFE-014) by URL alone.

import { describe, test, expect } from 'vitest';
import { isSupportedPuzzleUrl } from '../../extension/src/shared/urls.js';

describe('isSupportedPuzzleUrl', () => {
  test('REQ-LIFE-013: mini, midi and daily game pages are supported', () => {
    expect(isSupportedPuzzleUrl('https://www.nytimes.com/crosswords/game/mini')).toBe(true);
    expect(isSupportedPuzzleUrl('https://www.nytimes.com/crosswords/game/mini/2026/07/04')).toBe(true);
    expect(isSupportedPuzzleUrl('https://www.nytimes.com/crosswords/game/midi/')).toBe(true);
    expect(isSupportedPuzzleUrl('https://www.nytimes.com/crosswords/game/daily/2026/07/05')).toBe(true);
    expect(isSupportedPuzzleUrl('http://localhost:8787/')).toBe(true); // dev fixture (MT-23)
  });

  test('REQ-LIFE-013: everything else is not — including NYT pages outside the game URLs', () => {
    expect(isSupportedPuzzleUrl('https://www.nytimes.com/')).toBe(false);
    expect(isSupportedPuzzleUrl('https://www.nytimes.com/2026/07/05/some-article.html')).toBe(false);
    expect(isSupportedPuzzleUrl('https://www.nytimes.com/crosswords')).toBe(false); // landing/archive
    expect(isSupportedPuzzleUrl('https://www.nytimes.com/crosswords/game/acrostic/2026/07/05')).toBe(false);
    expect(isSupportedPuzzleUrl('https://example.com/crosswords/game/mini')).toBe(false);
    expect(isSupportedPuzzleUrl('chrome://extensions')).toBe(false);
    expect(isSupportedPuzzleUrl('')).toBe(false);
    expect(isSupportedPuzzleUrl(undefined)).toBe(false); // no "tabs" permission → no URL
  });
});
