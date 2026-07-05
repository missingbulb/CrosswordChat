// Where CrosswordChat works, decided by URL alone (REQ-LIFE-013) — the action icon and
// the unsupported-site popup (REQ-LIFE-014) must be right before any page loads or is
// inspected. Data only; shared by the service worker and unit tests.

const SUPPORTED_PREFIXES = [
  'https://www.nytimes.com/crosswords/game/mini',
  'https://www.nytimes.com/crosswords/game/midi',
  'https://www.nytimes.com/crosswords/game/daily',
  'http://localhost:8787/', // the fake-page rehearsal stage (MT-23, build:dev)
];

/** @param {string | undefined} url */
export function isSupportedPuzzleUrl(url) {
  return typeof url === 'string' && SUPPORTED_PREFIXES.some((p) => url.startsWith(p));
}
