// Grid writing via simulated user input (REQ-PAGE-006/007/008).
// Strategy: per-cell click (position-addressed — immune to NYT cursor-skip settings),
// then a keydown per letter, then verify by re-reading (never trust, always check).
// Fallbacks if the live page ignores untrusted events: docs/FEASIBILITY.md §3.

import { snapshot, cellElements } from './reader.js';

function fire(el, type, init) {
  const view = el.ownerDocument?.defaultView ?? globalThis;
  const Ctor = type.startsWith('key') ? view.KeyboardEvent : view.MouseEvent;
  el.dispatchEvent(new Ctor(type, { bubbles: true, cancelable: true, composed: true, ...init }));
}

export function clickCell(cellEl) {
  fire(cellEl, 'mousedown', {});
  fire(cellEl, 'mouseup', {});
  fire(cellEl, 'click', {});
}

function typeKey(document, key) {
  const target = document.activeElement && document.activeElement !== document.body
    ? document.activeElement
    : document.body;
  fire(target, 'keydown', { key, code: /^[A-Z]$/.test(key) ? `Key${key}` : key });
  fire(target, 'keyup', { key, code: /^[A-Z]$/.test(key) ? `Key${key}` : key });
}

/**
 * @param {Document} document
 * @param {Array<{index: number, letter: string}>} cells
 * @returns {{ok: boolean, snapshot: object}} ok = every targeted cell now shows its letter
 */
export function enterAnswer(document, cells) {
  const els = cellElements(document);
  for (const { index, letter } of cells) {
    const el = els[index];
    if (!el) return { ok: false, snapshot: snapshot(document) };
    clickCell(el);
    typeKey(document, String(letter).toUpperCase());
  }
  const after = snapshot(document);
  const byIndex = new Map(after.cells.map((c) => [c.index, c]));
  const ok = cells.every(({ index, letter }) => byIndex.get(index)?.letter === String(letter).toUpperCase());
  return { ok, snapshot: after };
}

/**
 * Clear the given cells (click + Backspace each) — replace flow support (REQ-PAGE-008).
 * @returns {{ok: boolean, snapshot: object}}
 */
export function clearEntry(document, cellIndices) {
  const els = cellElements(document);
  for (const index of cellIndices) {
    const el = els[index];
    if (!el) continue;
    clickCell(el);
    typeKey(document, 'Backspace');
  }
  const after = snapshot(document);
  const byIndex = new Map(after.cells.map((c) => [c.index, c]));
  const ok = cellIndices.every((i) => (byIndex.get(i)?.letter ?? '') === '');
  return { ok, snapshot: after };
}
