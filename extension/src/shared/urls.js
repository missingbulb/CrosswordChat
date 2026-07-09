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

// The project's GitHub new-issue page. Used only as the target of a link the USER clicks
// (REQ-DIAG-001) — the extension itself never fetches it, so this is not network access.
export const ISSUE_NEW_URL = 'https://github.com/missingbulb/CrosswordChat/issues/new';

/**
 * A prefilled new-issue URL for the "Send session data" export (REQ-DIAG-001). GitHub (and
 * browsers) cap URL length, so an over-long body is trimmed to fit with a note pointing the
 * user at "Copy log" for the complete text — nothing is silently dropped.
 * @param {{title?: string, body?: string, maxLength?: number}} p
 * @returns {string}
 */
export function buildIssueUrl({ title = '', body = '', maxLength = 6000 } = {}) {
  const base = `${ISSUE_NEW_URL}?title=${encodeURIComponent(title)}&body=`;
  const trailer = '\n\n(Log trimmed to fit this link — use “Copy log” for the full text.)';
  if ((base + encodeURIComponent(body)).length <= maxLength) return base + encodeURIComponent(body);
  let text = body;
  while (text && (base + encodeURIComponent(text + trailer)).length > maxLength) {
    text = text.slice(0, -Math.max(1, Math.ceil(text.length * 0.05))); // shave ~5% until it fits
  }
  return base + encodeURIComponent(text + trailer);
}
