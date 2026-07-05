// DOM → Snapshot (REQ-PAGE-001..004). Reads only; never mutates the page.

import { SEL, CLS } from './selectors.js';
import { parseClueHtml } from './clue-html.js';

function classHas(el, name) {
  return (el.getAttribute?.('class') ?? '').split(/\s+/).includes(name);
}

// Only an element's OWN text nodes — excludes nested children's content.
function ownText(el) {
  return [...el.childNodes]
    .filter((n) => n.nodeType === 3 /* TEXT_NODE */)
    .map((n) => n.textContent)
    .join('')
    .trim();
}

function readCellTexts(cellEl) {
  // Live markup (verified against a saved Mini page, 2026-07): the number and letter are
  // direct-child <text> elements with no distinguishing classes, and each NESTS a hidden
  // aria-live <text class="xwd__cell--hidden"> for screen readers. Reading textContent
  // would fold that hidden copy in, so only each element's own text nodes count.
  // Number = the pure-digit element; letter = any other non-empty one.
  const texts = [...cellEl.children].filter((el) => el.tagName?.toLowerCase() === 'text');
  if (texts.length) {
    const own = texts.map(ownText);
    const numIdx = own.findIndex((t) => /^\d+$/.test(t));
    const letterIdx = own.findIndex((t, i) => i !== numIdx && t);
    const letter = letterIdx >= 0 ? own[letterIdx] : '';
    // Pencil mode (REQ-PAGE-012): the marker sits on the letter <text> (or the cell <g>).
    const penciled = Boolean(letter)
      && (classHas(cellEl, CLS.cellPenciled) || (letterIdx >= 0 && classHas(texts[letterIdx], CLS.cellPenciled)));
    return { letter: letter.toUpperCase(), penciled, number: numIdx >= 0 ? Number(own[numIdx]) : null };
  }
  // Fallback: older class-tagged markup (SEL.cellLetter / SEL.cellNumber).
  const letterEl = cellEl.querySelector(SEL.cellLetter);
  const numberEl = cellEl.querySelector(SEL.cellNumber);
  const letter = (letterEl?.textContent ?? '').trim().toUpperCase();
  const penciled = Boolean(letter)
    && (classHas(cellEl, CLS.cellPenciled) || (letterEl && classHas(letterEl, CLS.cellPenciled)));
  const numText = (numberEl?.textContent ?? '').trim();
  return { letter, penciled, number: /^\d+$/.test(numText) ? Number(numText) : null };
}

function readGrid(document) {
  const cellEls = [...document.querySelectorAll(SEL.cell)];
  if (!cellEls.length) return null;

  const raw = cellEls.map((el) => {
    const rect = el.querySelector(SEL.cellRect);
    const x = Number(rect?.getAttribute('x') ?? 0);
    const y = Number(rect?.getAttribute('y') ?? 0);
    const block = classHas(el, CLS.cellBlock) || (rect && classHas(rect, CLS.cellBlock));
    const selected = classHas(el, CLS.cellSelected) || (rect && classHas(rect, CLS.cellSelected));
    const { letter, penciled, number } = block
      ? { letter: '', penciled: false, number: null }
      : readCellTexts(el);
    return { el, x, y, block, selected, letter, penciled, number };
  });

  // Dimensions derived from geometry, not hardcoded (REQ-PAGE-002).
  const xs = [...new Set(raw.map((c) => c.x))].sort((a, b) => a - b);
  const ys = [...new Set(raw.map((c) => c.y))].sort((a, b) => a - b);
  const cols = xs.length;
  const rows = ys.length;

  const cells = raw.map((c) => {
    const row = ys.indexOf(c.y);
    const col = xs.indexOf(c.x);
    return {
      index: row * cols + col,
      row,
      col,
      block: c.block,
      letter: c.block ? '' : c.letter,
      penciled: c.block ? false : c.penciled,
      number: c.number,
      _selected: c.selected,
      _el: c.el,
    };
  }).sort((a, b) => a.index - b.index);

  return { rows, cols, cells };
}

function readClueLists(document) {
  const clues = [];
  let selectedClueId = null;
  for (const wrapper of document.querySelectorAll(SEL.clueListWrapper)) {
    const title = (wrapper.querySelector(SEL.clueListTitle)?.textContent ?? '').trim().toLowerCase();
    const direction = title.startsWith('a') ? 'across' : 'down';
    for (const item of wrapper.querySelectorAll(SEL.clueItem)) {
      const number = Number((item.querySelector(SEL.clueLabel)?.textContent ?? '').trim());
      if (!Number.isFinite(number) || number <= 0) continue;
      const html = item.querySelector(SEL.clueText)?.innerHTML ?? '';
      const id = `${direction === 'across' ? 'A' : 'D'}${number}`;
      clues.push({ id, number, direction, runs: parseClueHtml(html) });
      if (classHas(item, CLS.clueSelected)) selectedClueId = id;
    }
  }
  return { clues, selectedClueId };
}

export function isSolved(document) {
  return Boolean(document.querySelector(SEL.congrats));
}

/** @returns {object} Snapshot (docs/ARCHITECTURE.md §3) */
export function snapshot(document) {
  const grid = readGrid(document);
  if (!grid) {
    return {
      status: 'not-found',
      size: { rows: 0, cols: 0 },
      cells: [],
      clues: [],
      selection: { clueId: null, cellIndex: null },
    };
  }
  const { clues, selectedClueId } = readClueLists(document);
  const selectedCell = grid.cells.find((c) => c._selected);
  const cells = grid.cells.map(({ _selected, _el, ...cell }) => cell);
  return {
    status: isSolved(document) ? 'solved' : 'active',
    size: { rows: grid.rows, cols: grid.cols },
    cells,
    clues,
    selection: { clueId: selectedClueId, cellIndex: selectedCell?.index ?? null },
  };
}

/** Cell elements in snapshot index order — shared with writer/navigator. */
export function cellElements(document) {
  const grid = readGrid(document);
  return grid ? grid.cells.map((c) => c._el) : [];
}
