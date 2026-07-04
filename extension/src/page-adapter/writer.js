// Grid writing via simulated user input (REQ-PAGE-006/007/008).
// Strategy: per-cell click (position-addressed — immune to NYT cursor-skip settings),
// then a keydown per letter, then verify by re-reading (never trust, always check).
//
// Live-page hardening (MT-02 findings):
//   - Synthetic key events carry the legacy keyCode/which/charCode fields — the live
//     app's handlers read those, and a bare {key} event constructs them as 0.
//   - The live page renders asynchronously (React), so verification POLLS the DOM
//     instead of reading it synchronously right after the last dispatch.
// Further fallbacks if the live page ignores untrusted events: docs/FEASIBILITY.md §3.

import { snapshot, cellElements } from './reader.js';

const settle = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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

const LEGACY_KEYCODE = { Backspace: 8 };

function keyEventInit(key) {
  const letter = /^[A-Z]$/.test(key);
  const keyCode = letter ? key.charCodeAt(0) : (LEGACY_KEYCODE[key] ?? 0);
  return { key, code: letter ? `Key${key}` : key, keyCode, which: keyCode };
}

function typeKey(document, key, cellEl) {
  // Key events must bubble THROUGH the app's root container: the live page delegates
  // key handling near its own root (React-style), and that root is a DESCENDANT of
  // <body> — an event dispatched on body bubbles up past document without ever
  // passing through it. Prefer the element the app focused (the selected cell's rect
  // carries tabindex=0); otherwise dispatch on the cell itself.
  const active = document.activeElement;
  const target = active && active !== document.body && active !== document.documentElement
    ? active
    : (cellEl ?? document.body);
  const init = keyEventInit(key);
  fire(target, 'keydown', init);
  if (/^[A-Z]$/.test(key)) fire(target, 'keypress', { ...init, charCode: init.keyCode });
  fire(target, 'keyup', init);
}

/**
 * Poll the grid until `check(cellsByIndex)` passes or the deadline expires.
 * The final snapshot is returned either way, so failures stay honest (REQ-ANS-013).
 */
async function verify(document, check, { verifyTimeoutMs, pollMs }) {
  const deadline = Date.now() + verifyTimeoutMs;
  for (;;) {
    const snap = snapshot(document);
    const byIndex = new Map(snap.cells.map((c) => [c.index, c]));
    if (check(byIndex)) return { ok: true, snapshot: snap };
    if (Date.now() >= deadline) return { ok: false, snapshot: snap };
    await settle(pollMs);
  }
}

/**
 * @param {Document} document
 * @param {Array<{index: number, letter: string}>} cells
 * @param {{verifyTimeoutMs?: number, pollMs?: number, keySettleMs?: number}} [opts]
 * @returns {Promise<{ok: boolean, snapshot: object}>} ok = every targeted cell now shows its letter
 */
export async function enterAnswer(document, cells, opts = {}) {
  const { verifyTimeoutMs = 1500, pollMs = 50, keySettleMs = 15 } = opts;
  const els = cellElements(document);
  for (const { index, letter } of cells) {
    const el = els[index];
    if (!el) return { ok: false, snapshot: snapshot(document) };
    clickCell(el);
    await settle(keySettleMs); // let the app apply the selection before we type into it
    typeKey(document, String(letter).toUpperCase(), el);
    await settle(keySettleMs);
  }
  return verify(
    document,
    (byIndex) => cells.every(({ index, letter }) => byIndex.get(index)?.letter === String(letter).toUpperCase()),
    { verifyTimeoutMs, pollMs },
  );
}

/**
 * Clear the given cells (click + Backspace each) — replace flow support (REQ-PAGE-008).
 * @returns {Promise<{ok: boolean, snapshot: object}>}
 */
export async function clearEntry(document, cellIndices, opts = {}) {
  const { verifyTimeoutMs = 1500, pollMs = 50, keySettleMs = 15 } = opts;
  const els = cellElements(document);
  for (const index of cellIndices) {
    const el = els[index];
    if (!el) continue;
    clickCell(el);
    await settle(keySettleMs);
    typeKey(document, 'Backspace', el);
    await settle(keySettleMs);
  }
  return verify(
    document,
    (byIndex) => cellIndices.every((i) => (byIndex.get(i)?.letter ?? '') === ''),
    { verifyTimeoutMs, pollMs },
  );
}
