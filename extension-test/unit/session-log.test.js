// In-memory diagnostics log + user-invoked export (REQ-DIAG-001): the log is formatted for
// the "Send session data" dialog (display, clipboard, prefilled GitHub issue). Pure text +
// URL building — no persistence, no network; the issue URL is only ever a link the user clicks.

import { describe, test, expect } from 'vitest';
import { formatSessions } from '../../extension/src/shared/session-log.js';
import { buildIssueUrl, ISSUE_NEW_URL } from '../../extension/src/shared/urls.js';

describe('session diagnostics log (REQ-DIAG-001)', () => {
  test('empty history reads as a clear placeholder', () => {
    expect(formatSessions([])).toMatch(/no voice sessions/i);
    expect(formatSessions()).toMatch(/no voice sessions/i);
  });

  test('renders the settings (with biasing) and per-turn said/heard/error lines', () => {
    const text = formatSessions([{
      startedAt: 1000,
      settings: { strategy: 'list-order', rate: 1.3, biasing: 'full' },
      entries: [
        { t: 1000, kind: 'said', text: '12 Across. Little house.', sayKind: 'clue' },
        { t: 2500, kind: 'heard', mode: 'normal', alternatives: [{ transcript: 'heart', confidence: 0.92 }, { transcript: 'hart', confidence: 0.7 }] },
        { t: 3000, kind: 'stt-error', code: 'no-speech' },
      ],
    }]);
    expect(text).toContain('## Session 1');
    expect(text).toContain('biasing=full');
    expect(text).toContain('Little house');
    expect(text).toContain('"heart" (0.92)'); // full n-best with confidence
    expect(text).toContain('"hart"');
    expect(text).toContain('ERROR: no-speech');
  });

  test('multiple sessions on one page load are numbered in order', () => {
    const text = formatSessions([
      { startedAt: 0, settings: {}, entries: [] },
      { startedAt: 0, settings: {}, entries: [] },
    ]);
    expect(text).toContain('## Session 1');
    expect(text).toContain('## Session 2');
  });

  test('buildIssueUrl targets the repo new-issue page with title + body params', () => {
    const url = buildIssueUrl({ title: 'CrosswordChat session data', body: 'hello world' });
    expect(url.startsWith(`${ISSUE_NEW_URL}?`)).toBe(true);
    expect(url).toContain('title=CrosswordChat');
    expect(url).toContain('&body=hello%20world');
  });

  test('buildIssueUrl trims an over-long body to fit the cap and notes the trim', () => {
    const body = 'x'.repeat(50_000);
    const url = buildIssueUrl({ title: 't', body, maxLength: 2000 });
    expect(url.length).toBeLessThanOrEqual(2000);
    expect(decodeURIComponent(url)).toMatch(/Copy log/i); // pointer to the full-text option
  });
});
