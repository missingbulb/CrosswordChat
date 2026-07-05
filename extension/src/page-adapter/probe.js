// Selector health probe (REQ-PAGE-009): the first thing to run when NYT changes markup.
// Returns a report, never throws — a broken page is a *finding*, not an exception.

import { SEL, findPencilToggle } from './selectors.js';
import { snapshot } from './reader.js';

export function probe(document) {
  const items = [];
  const add = (name, ok, detail) => items.push({ name, ok: Boolean(ok), detail: String(detail) });

  const count = (sel) => document.querySelectorAll(sel).length;

  const boardCount = count(SEL.board);
  add('board', boardCount >= 1, `${boardCount} match(es) for ${SEL.board}`);

  const cellCount = count(SEL.cell);
  add('cells', cellCount >= 4, `${cellCount} match(es) for ${SEL.cell}`);

  const wrapperCount = count(SEL.clueListWrapper);
  add('clue lists', wrapperCount === 2, `${wrapperCount} wrapper(s) (want 2: Across + Down)`);

  const clueItems = count(SEL.clueItem);
  add('clue items', clueItems >= 2, `${clueItems} item(s)`);

  const clueTexts = count(SEL.clueText);
  add('clue texts', clueTexts >= 2 && clueTexts === clueItems,
    `${clueTexts} text node(s) for ${clueItems} item(s)`);

  const pencil = findPencilToggle(document);
  add('pencil toggle', pencil != null, pencil
    ? `found: <${pencil.tagName.toLowerCase()} aria-label="${pencil.getAttribute('aria-label') ?? ''}" class="${pencil.getAttribute('class') ?? ''}"> (REQ-PAGE-012)`
    : `no match (selector nets + fallbacks) for ${SEL.pencilToggle} (REQ-PAGE-012)`);

  const toolbars = count(SEL.toolbar);
  add('toolbar', toolbars >= 1, `${toolbars} match(es) for ${SEL.toolbar} (REQ-LIFE-012 anchor)`);

  // Live-markup forensics: every button the page offers, so a failed pencil/toolbar
  // hunt can be diagnosed from the probe output alone (informational).
  const describe = (b) => {
    const name = (b.getAttribute('aria-label') ?? b.getAttribute('title')
      ?? b.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 40) || '(unnamed)';
    const cls = (b.getAttribute('class') ?? '').split(/\s+/).filter(Boolean).slice(0, 2).join(' ');
    return cls ? `${name} <${cls}>` : name;
  };
  const pageButtons = [...document.querySelectorAll('button, [role="button"]')].slice(0, 25);
  add('page buttons', true, pageButtons.length
    ? pageButtons.map(describe).join(' · ')
    : 'none found (informational)');

  let snap = null;
  try {
    snap = snapshot(document);
  } catch (err) {
    add('snapshot', false, `snapshot() threw: ${err?.message ?? err}`);
  }
  if (snap) {
    add('status', snap.status !== 'not-found', `status=${snap.status}`);
    add('grid size', snap.size.rows >= 2 && snap.size.cols >= 2,
      `${snap.size.rows}×${snap.size.cols}`);
    add('grid complete', snap.cells.length === snap.size.rows * snap.size.cols,
      `${snap.cells.length} cells for ${snap.size.rows}×${snap.size.cols}`);
    const numbered = snap.cells.filter((c) => c.number != null).length;
    add('cell numbers', numbered >= 1, `${numbered} numbered cell(s)`);
    const across = snap.clues.filter((c) => c.direction === 'across').length;
    const down = snap.clues.filter((c) => c.direction === 'down').length;
    add('across clues', across >= 1, `${across}`);
    add('down clues', down >= 1, `${down}`);
    add('selection', true, snap.selection.clueId
      ? `selected: ${snap.selection.clueId}`
      : 'none selected (informational)');
    // Informational: main-world helper marks window.gameData presence (see content/main-world.js).
    const gd = document.documentElement.dataset?.ccGamedata;
    add('window.gameData', true, gd === 'true' ? 'present' : 'absent or unknown (informational)');
  }

  return { ok: items.every((i) => i.ok), items };
}
