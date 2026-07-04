// @vitest-environment jsdom
// Page adapter vs. the faithful fake NYT page (tests/fixtures/fake-nyt).
// Same selectors, same keyboard behavior, same congrats modal as the live page —
// this is the executable stand-in until MT-01/MT-02 confirm against nytimes.com.

import { describe, test, expect, beforeEach } from 'vitest';
import { initFakeNyt } from '../fixtures/fake-nyt/fake-app.js';
import { FIXTURE_PUZZLE } from '../fixtures/fake-nyt/puzzle.js';
import { snapshot } from '../../extension/src/page-adapter/reader.js';
import { enterAnswer, clearEntry } from '../../extension/src/page-adapter/writer.js';
import { selectClue } from '../../extension/src/page-adapter/navigator.js';
import { probe } from '../../extension/src/page-adapter/probe.js';
import { createWatcher } from '../../extension/src/page-adapter/watcher.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const word = (letters, startIndex, stride) =>
  letters.split('').map((letter, i) => ({ index: startIndex + i * stride, letter }));

let app;
beforeEach(() => {
  app = initFakeNyt(document, FIXTURE_PUZZLE);
});

function solveEverything() {
  FIXTURE_PUZZLE.solution.forEach((row, r) => {
    app.typeAt(r * FIXTURE_PUZZLE.cols, 'across', row);
  });
}

describe('reader', () => {
  test('REQ-PAGE-001: classifies active / solved / not-found', () => {
    expect(snapshot(document).status).toBe('active');
    solveEverything();
    expect(snapshot(document).status).toBe('solved');
    document.body.innerHTML = '';
    expect(snapshot(document).status).toBe('not-found');
  });

  test('REQ-PAGE-002: grid snapshot — derived size, numbers, letters', () => {
    const snap = snapshot(document);
    expect(snap.size).toEqual({ rows: 5, cols: 5 });
    expect(snap.cells).toHaveLength(25);
    expect(snap.cells[0]).toMatchObject({ index: 0, row: 0, col: 0, block: false, letter: '', number: 1 });
    expect(snap.cells[4].number).toBe(5); // D5 starts here
    expect(snap.cells[5].number).toBe(6); // A6 starts row 1
    expect(snap.cells[6].number).toBeNull();

    app.typeAt(0, 'across', 'HEART');
    const after = snapshot(document);
    expect(after.cells.slice(0, 5).map((c) => c.letter)).toEqual(['H', 'E', 'A', 'R', 'T']);
  });

  test('REQ-PAGE-003: clue snapshot preserves rich formatting as runs', () => {
    const snap = snapshot(document);
    const a6 = snap.clues.find((c) => c.id === 'A6');
    expect(a6.runs).toEqual([
      { text: 'Dying ', italic: false },
      { text: 'fire', italic: true },
      { text: ' bit', italic: false },
    ]);
    const d1 = snap.clues.find((c) => c.id === 'D1');
    expect(d1.runs[0].text).toContain('“The ___ of the Matter”'); // entities decoded
    expect(snap.clues).toHaveLength(10);
  });

  test('REQ-PAGE-004: reads the current selection', () => {
    const snap = snapshot(document);
    expect(snap.selection).toEqual({ clueId: 'A1', cellIndex: 0 });
  });
});

describe('navigator', () => {
  test('REQ-PAGE-005/REQ-NAV-007: selecting a clue highlights it on the page', () => {
    expect(selectClue(document, 'D3')).toBe(true);
    expect(snapshot(document).selection.clueId).toBe('D3');
    expect(selectClue(document, 'A9')).toBe(true);
    expect(snapshot(document).selection.clueId).toBe('A9');
    expect(selectClue(document, 'D99')).toBe(false);
  });
});

describe('writer', () => {
  test('REQ-PAGE-006: types a word into the right cells via click + keydown', async () => {
    const result = await enterAnswer(document, word('HEART', 0, 1)); // A1
    expect(result.ok).toBe(true);
    expect(result.snapshot.cells.slice(0, 5).map((c) => c.letter)).toEqual(['H', 'E', 'A', 'R', 'T']);

    const down = await enterAnswer(document, word('TREND', 4, 5)); // D5 (column 4)
    expect(down.ok).toBe(true);
    expect(down.snapshot.cells[9].letter).toBe('R');
    expect(down.snapshot.cells[24].letter).toBe('D');
  });

  test('REQ-PAGE-006/007: survives a live-like page — async repaints + legacy-keyCode handlers', async () => {
    // The failure seen on the real page: probe all green, yet entry "fails" because the
    // app repaints asynchronously and its handlers read event.keyCode (0 on bare events).
    app = initFakeNyt(document, FIXTURE_PUZZLE, { renderDelayMs: 30, legacyKeysOnly: true });
    const result = await enterAnswer(document, word('HEART', 0, 1));
    expect(result.ok).toBe(true);
    expect(result.snapshot.cells.slice(0, 5).map((c) => c.letter)).toEqual(['H', 'E', 'A', 'R', 'T']);
  });

  test('REQ-PAGE-007/REQ-ANS-013: verification catches a page that swallows keystrokes', async () => {
    app = initFakeNyt(document, FIXTURE_PUZZLE, { swallowKeys: true });
    const result = await enterAnswer(document, word('HEART', 0, 1), { verifyTimeoutMs: 80, pollMs: 20 });
    expect(result.ok).toBe(false); // honest failure, surfaced to the conversation
  });

  test('REQ-PAGE-008: clearEntry empties the targeted cells', async () => {
    await enterAnswer(document, word('HEART', 0, 1));
    const result = await clearEntry(document, [0, 1, 2, 3, 4]);
    expect(result.ok).toBe(true);
    expect(result.snapshot.cells.slice(0, 5).map((c) => c.letter)).toEqual(['', '', '', '', '']);
  });
});

describe('probe', () => {
  test('REQ-PAGE-009: all green on the faithful page', () => {
    const report = probe(document);
    expect(report.ok).toBe(true);
    expect(report.items.every((i) => i.ok)).toBe(true);
  });

  test('REQ-PAGE-009: broken page yields failures, not exceptions', () => {
    document.body.innerHTML = '<p>redesigned!</p>';
    const report = probe(document);
    expect(report.ok).toBe(false);
    expect(report.items.some((i) => !i.ok)).toBe(true);
  });
});

describe('watcher', () => {
  test('REQ-PAGE-010: solved event fires when the puzzle completes', async () => {
    const events = [];
    const watcher = createWatcher(document, (kind, snap) => events.push({ kind, status: snap.status }), { debounceMs: 5 });
    watcher.start();
    solveEverything();
    await sleep(40);
    watcher.stop();
    expect(events.some((e) => e.kind === 'solved' && e.status === 'solved')).toBe(true);
  });

  test('REQ-PAGE-010/REQ-NAV-008: selection events fire on clue clicks; pause suppresses', async () => {
    const events = [];
    const watcher = createWatcher(document, (kind, snap) => events.push({ kind, clueId: snap.selection.clueId }), { debounceMs: 5 });
    watcher.start();
    selectClue(document, 'D2');
    await sleep(40);
    expect(events.some((e) => e.kind === 'selection' && e.clueId === 'D2')).toBe(true);

    events.length = 0;
    watcher.pause();
    await enterAnswer(document, word('EMBER', 5, 1)); // our own write while paused
    await sleep(40);
    watcher.resume();
    await sleep(40);
    watcher.stop();
    expect(events).toEqual([]); // no echo of our own activity
  });
});
