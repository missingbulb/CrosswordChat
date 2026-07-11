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

/**
 * Compact puzzle identifier for the session log's run context (REQ-DIAG-002): the path
 * tail after the crosswords game prefix, slashes folded to dashes — `mini`,
 * `daily-2026-07-10`. Unrecognized paths yield '' (the log simply omits the field).
 * @param {string | undefined} pathname  e.g. location.pathname
 * @returns {string}
 */
export function puzzleTag(pathname) {
  const m = String(pathname ?? '').match(/^\/crosswords\/game\/(.+?)\/?$/);
  return m ? m[1].replace(/\//g, '-') : '';
}

// The project's GitHub new-issue page. Used only as the target of a link the USER clicks
// (REQ-DIAG-001) — the extension itself never fetches it, so this is not network access.
export const ISSUE_NEW_URL = 'https://github.com/missingbulb/CrosswordChat/issues/new';

/**
 * A prefilled new-issue URL for the "Send session data" export (REQ-DIAG-001). GitHub (and
 * browsers) cap URL length, so an over-long body is trimmed to fit with a note pointing the
 * user at "Copy log" for the complete text — nothing is silently dropped.
 *
 * `trim(fits)` lets the caller rebuild a smaller body that satisfies the `fits` predicate
 * with format awareness (whole events only, newest tail kept — REQ-DIAG-001, implemented by
 * the session-log formatter). The character-shave loop below remains the hard-cap backstop
 * for whatever the trimmer returns.
 * @param {{title?: string, body?: string, maxLength?: number,
 *   trim?: (fits: (text: string) => boolean) => string}} p
 * @returns {string}
 */
export function buildIssueUrl({ title = '', body = '', maxLength = 6000, trim } = {}) {
  const base = `${ISSUE_NEW_URL}?title=${encodeURIComponent(title)}&body=`;
  const trailer = '\n\n(Log trimmed to fit this link — use “Copy log” for the full text.)';
  if ((base + encodeURIComponent(body)).length <= maxLength) return base + encodeURIComponent(body);
  const fits = (text) => (base + encodeURIComponent(text + trailer)).length <= maxLength;
  let text = trim ? trim(fits) : body;
  while (text && !fits(text)) {
    text = text.slice(0, -Math.max(1, Math.ceil(text.length * 0.05))); // shave ~5% until it fits
  }
  return base + encodeURIComponent(text + trailer);
}
