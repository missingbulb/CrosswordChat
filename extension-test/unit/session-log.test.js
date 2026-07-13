// In-memory diagnostics log + user-invoked export (REQ-DIAG-001/002): the compact CWC1
// format for the "Send session data" dialog (display, clipboard, prefilled GitHub issue).
// Pure text + URL building — no persistence, no network; the issue URL is only ever a link
// the user clicks. The format grammar is documented in dev/docs/SESSION-LOG.md, held equal
// to the formatter by the drift-guard below.

import { readFileSync } from 'node:fs';
import { describe, test, expect } from 'vitest';
import { formatSessions, formatSessionsWithin } from '../../extension/src/shared/session-log.js';
import { buildIssueUrl, ISSUE_NEW_URL, puzzleTag } from '../../extension/src/shared/urls.js';

// The canonical fixture behind dev/docs/SESSION-LOG.md's worked example.
const EXAMPLE = [{
  startedAt: 1000,
  version: '0.13.5',
  puzzle: 'mini',
  settings: { strategy: 'most-filled', rate: 1.4, biasing: 'full', echoMode: 'guard' },
  onDevice: true,
  aec: true,
  entries: [
    { t: 1000, kind: 'said', say: { kind: 'clue', label: '1 Across', len: 4 } },
    { t: 7000, kind: 'heard', mode: 'normal', alternatives: [{ transcript: 'next', confidence: 0.69 }] },
    { t: 7000, kind: 'said', say: { kind: 'clue', label: '2 Down', len: 3 } },
    { t: 12000, kind: 'heard', mode: 'normal', alternatives: [{ transcript: 'med', confidence: 0.65 }, { transcript: 'mad', confidence: 0.39 }] },
    { t: 12000, kind: 'said', say: { kind: 'fit', word: 'MED', spelledDifferently: false } },
    { t: 16000, kind: 'stt-error', code: 'no-speech' },
    { t: 19000, kind: 'heard', mode: 'normal', alternatives: [{ transcript: 'new york', confidence: 0.2 }] },
    { t: 19000, kind: 'said', say: { kind: 'length-mismatch', variants: [{ word: 'NEWYORK', len: 7, swaps: 0 }, { word: 'KNEWYORK', len: 8, swaps: 1 }], needed: 4 } },
    { t: 30000, kind: 'typed', clueId: 'A1', word: 'FINN' },
    { t: 34000, kind: 'end', reason: 'user' },
  ],
}];

// Sessions with recognizable transcripts, for the trim tests.
function fatSession(startedAt, words) {
  return {
    startedAt,
    settings: { strategy: 'most-filled', rate: 1.4, biasing: 'full', echoMode: 'guard' },
    entries: words.map((w, i) => ({
      t: startedAt + i * 5000,
      kind: 'heard',
      mode: 'normal',
      alternatives: [{ transcript: w, confidence: 0.9 }],
    })),
  };
}

describe('session diagnostics log (REQ-DIAG-001, REQ-DIAG-002)', () => {
  test('empty history reads as a clear placeholder', () => {
    expect(formatSessions([])).toMatch(/no voice sessions/i);
    expect(formatSessions()).toMatch(/no voice sessions/i);
  });

  test('compact format: run context, settings header with engagement flags, coded events', () => {
    const text = formatSessions(EXAMPLE);
    expect(text).toBe([
      '```',
      'CWC1 v0.13.5 mini',
      '',
      'S1 mf 1.4 bf eg od1 aec1 (10)',
      '>1A.4!6h next~69!>2D.3!5h med~65*mad~39!+!4en!3h new york~20!L7.8n4!11t 1A finn!4z user',
      '```',
    ].join('\n'));
  });

  test('the worked example in dev/docs/SESSION-LOG.md matches the real formatter (drift guard)', () => {
    // The doc IS the analyst's decoder ring — a stale example would mislead every
    // future investigation, so it is held byte-equal to formatSessions() here.
    const doc = readFileSync(new URL('../../dev/docs/SESSION-LOG.md', import.meta.url), 'utf8');
    const block = doc.match(/session-log-example:begin[^\n]*-->\n([\s\S]*?)<!-- session-log-example:end/)?.[1];
    expect(block).toBeTruthy();
    const example = block.split('\n').filter((line) => line.trim() !== '````').join('\n').trim();
    expect(example).toBe(formatSessions(EXAMPLE));
  });

  test('heard transcripts stay plain text; the structural characters !*~ are stripped from them', () => {
    const text = formatSessions([{
      startedAt: 0,
      settings: {},
      entries: [
        { t: 0, kind: 'heard', mode: 'spelling', bargeIn: true, alternatives: [{ transcript: "you're not talking! *now*~", confidence: 0 }] },
      ],
    }]);
    expect(text).toContain("hbs you're not talking now"); // barge-in + spelling mode tags
    expect(text).not.toMatch(/talking!/);
  });

  test('unknown say kinds and error codes degrade to a named fallback, never dropped', () => {
    const text = formatSessions([{
      startedAt: 0,
      settings: {},
      entries: [
        { t: 0, kind: 'said', say: { kind: 'brand-new-kind' } },
        { t: 1000, kind: 'stt-error', code: 'weird-new-code' },
        { t: 2000, kind: 'typed', cells: 6 }, // multi-entry change (reveal-all etc.)
      ],
    }]);
    expect(text).toContain('(brand-new-kind)');
    expect(text).toContain('e(weird-new-code)');
    expect(text).toContain('t *6');
  });

  test('multiple sessions on one page load are numbered in order', () => {
    const text = formatSessions([
      { startedAt: 0, settings: {}, entries: [] },
      { startedAt: 0, settings: {}, entries: [] },
    ]);
    expect(text).toContain('S1 ');
    expect(text).toContain('S2 ');
  });

  test('REQ-DIAG-002: engagement flags render only when known', () => {
    const text = formatSessions([
      { startedAt: 0, settings: {}, onDevice: false, entries: [] },
      { startedAt: 0, settings: {}, entries: [] },
    ]);
    expect(text).toContain('od0');
    expect(text).not.toContain('aec'); // unknown → absent, never guessed
  });

  test('trimming collapses the OLDEST session before the newest loses anything', () => {
    const sessions = [fatSession(0, ['alpha one', 'alpha two', 'alpha three']), fatSession(60_000, ['omega one', 'omega two', 'omega three'])];
    const full = formatSessions(sessions);
    const text = formatSessionsWithin(sessions, (t) => t.length <= full.length - 20);
    expect(text).toContain('(3 events omitted)'); // S1 collapsed to its header + marker
    expect(text).not.toContain('alpha');
    expect(text).toContain('omega one'); // S2 untouched
    expect(text).toContain('omega three');
  });

  test('the newest session trims from its HEAD — the tail (how it ended) survives', () => {
    const words = Array.from({ length: 20 }, (_, i) => `word${i + 1}`);
    const sessions = [fatSession(0, words)];
    const text = formatSessionsWithin(sessions, (t) => t.length <= 250);
    expect(text.length).toBeLessThanOrEqual(250);
    expect(text).toContain('word20~90'); // last event intact — whole events only
    expect(text).not.toContain('word1~90');
    expect(text).toMatch(/\(\d+ earlier events omitted\)/);
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

  test('buildIssueUrl + the format-aware trimmer keep the newest tail inside the cap', () => {
    const sessions = [fatSession(0, Array.from({ length: 10 }, (_, i) => `old${i + 1}`)),
      fatSession(60_000, Array.from({ length: 30 }, (_, i) => `new${i + 1}`))];
    const url = buildIssueUrl({
      title: 'CrosswordChat session data',
      body: formatSessions(sessions),
      maxLength: 600, // tight enough that whole-event trimming must engage
      trim: (fits) => formatSessionsWithin(sessions, fits),
    });
    expect(url.length).toBeLessThanOrEqual(600);
    const decoded = decodeURIComponent(url);
    expect(decoded).toContain('new30~90'); // the newest session's ending survived
    expect(decoded).toMatch(/omitted/);
    expect(decoded).toMatch(/Copy log/i);
  });

  test('REQ-DIAG-002: puzzleTag extracts the puzzle path tail for the run context', () => {
    expect(puzzleTag('/crosswords/game/mini')).toBe('mini');
    expect(puzzleTag('/crosswords/game/daily/2026/07/10')).toBe('daily-2026-07-10');
    expect(puzzleTag('/elsewhere')).toBe('');
    expect(puzzleTag()).toBe('');
  });
});
