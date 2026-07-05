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
//
// Pencil mode (REQ-PAGE-012): cells may carry a `pencil` flag; letters are typed with
// the page's pencil toggle driven to match, and the toggle is restored afterwards so
// the user's own typing mode is never stolen. Success stays judged on letters — a page
// whose pencil markup drifted degrades the softening (REQ-ANS-019), not answering.

import { snapshot, cellElements } from './reader.js';
import { CLS, findPencilToggle } from './selectors.js';

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

function pencilToggle(document) {
  return findPencilToggle(document);
}

// Class markers that would say "this toggle is ON" (none observed live yet — the
// probe's pencil forensics exist to capture one when the user finds it).
const ACTIVE_CLASS = /(^|[-_])(active|selected|pressed|on)([-_]|$)/i;

/**
 * Pencil-mode signal from the page: true/false when readable, or NULL when the markup
 * carries no state at all — the live button is `<button><i class="xwd__toolbar_icon--
 * pencil"></i></button>` with no aria-pressed and no class change (verified live,
 * 2026-07), so blindness is the NORMAL case and the writer falls back to click parity.
 */
function pencilModeOn(document) {
  const el = pencilToggle(document);
  if (!el) return null;
  const pressed = el.getAttribute('aria-pressed');
  if (pressed != null) return pressed === 'true';
  const carriers = [el, ...el.querySelectorAll('[class]'), el.closest('li')].filter(Boolean);
  for (const c of carriers) {
    const cls = c.getAttribute('class') ?? '';
    if (cls.split(/\s+/).includes(CLS.pencilActive)) return true;
    if (ACTIVE_CLASS.test(cls)) return true;
  }
  return null; // no readable state — derive from our own click parity
}

/**
 * Poll the grid until `want(cellsByIndex)` passes or the deadline expires; at the
 * deadline `judge(cellsByIndex)` decides `ok`. The final snapshot is returned either
 * way, so failures stay honest (REQ-ANS-013).
 */
async function verify(document, want, judge, { verifyTimeoutMs, pollMs }) {
  const deadline = Date.now() + verifyTimeoutMs;
  for (;;) {
    const snap = snapshot(document);
    const byIndex = new Map(snap.cells.map((c) => [c.index, c]));
    if (want(byIndex)) return { ok: true, snapshot: snap };
    if (Date.now() >= deadline) return { ok: judge(byIndex), snapshot: snap };
    await settle(pollMs);
  }
}

/**
 * @param {Document} document
 * @param {Array<{index: number, letter: string, pencil?: boolean}>} cells
 * @param {{verifyTimeoutMs?: number, pollMs?: number, keySettleMs?: number}} [opts]
 * @returns {Promise<{ok: boolean, snapshot: object}>} ok = every targeted cell now shows its letter
 */
export async function enterAnswer(document, cells, opts = {}) {
  const { verifyTimeoutMs = 1500, pollMs = 50, keySettleMs = 15 } = opts;
  const els = cellElements(document);
  // Current letters, for the same-letter conversion below.
  const letterAt = new Map(snapshot(document).cells.map((c) => [c.index, c.letter]));

  const detected = pencilModeOn(document); // true | false | null (live page: null)
  const wasPencilOn = detected ?? false; // blind ⇒ assume the common case: pen
  let toggleClicks = 0;

  // Drive the toggle to `target`. When the page exposes no state (the live button —
  // see pencilModeOn), the current mode is derived from the assumed start + our own
  // click count, which guarantees a net-zero number of clicks over the whole write:
  // even blind, the user's toggle is never stolen (REQ-PAGE-012).
  const setPencilMode = async (target) => {
    const el = pencilToggle(document);
    if (!el) return;
    const current = pencilModeOn(document)
      ?? ((wasPencilOn ? 1 : 0) + toggleClicks) % 2 === 1;
    if (current === Boolean(target)) return;
    fire(el, 'mousedown', {});
    fire(el, 'mouseup', {});
    fire(el, 'click', {});
    toggleClicks += 1;
    await settle(keySettleMs);
  };

  // Batch by target mode (pen first) so the toggle is clicked at most three times:
  // pen batch, pencil batch, restore.
  const batches = [
    cells.filter((c) => !c.pencil),
    cells.filter((c) => c.pencil),
  ].filter((batch) => batch.length);
  let missingCell = false;
  for (const batch of batches) {
    await setPencilMode(Boolean(batch[0].pencil));
    for (const { index, letter } of batch) {
      const el = els[index];
      if (!el) {
        missingCell = true;
        break;
      }
      clickCell(el);
      await settle(keySettleMs); // let the app apply the selection before we type into it
      const target = String(letter).toUpperCase();
      // Retyping the letter a cell already shows is a no-op to the app, so a pure
      // pen↔pencil conversion (REQ-ANS-019 softening, undo's un-softening) would
      // change nothing — clear first, then retype in the current mode.
      if ((letterAt.get(index) ?? '') === target) {
        typeKey(document, 'Backspace', el);
        await settle(keySettleMs);
      }
      typeKey(document, target, el);
      await settle(keySettleMs);
    }
    if (missingCell) break;
  }
  await setPencilMode(wasPencilOn); // the user's toggle, not ours
  if (missingCell) return { ok: false, snapshot: snapshot(document) };
  const lettersLanded = (byIndex) =>
    cells.every(({ index, letter }) => byIndex.get(index)?.letter === String(letter).toUpperCase());
  // Pencil state is only awaited where the caller stated an intent ('pencil' present),
  // and even then it never fails a write whose letters all landed (REQ-PAGE-012).
  const pencilLanded = (byIndex) =>
    cells.every((c) => !('pencil' in c) || Boolean(byIndex.get(c.index)?.penciled) === Boolean(c.pencil));
  return verify(
    document,
    (byIndex) => lettersLanded(byIndex) && pencilLanded(byIndex),
    lettersLanded,
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
  const empty = (byIndex) => cellIndices.every((i) => (byIndex.get(i)?.letter ?? '') === '');
  return verify(document, empty, empty, { verifyTimeoutMs, pollMs });
}
