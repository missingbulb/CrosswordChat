// Every NYT DOM selector/class in one file (REQ-PAGE-011).
//
// ⚠️ These are best-effort observations of the NYT crossword markup (the `xwd__`
// class family) and WILL drift when NYT redesigns. The contract is:
//   1. run probe() (panel "Probe page" button / MT-01) after any breakage,
//   2. fix values HERE only,
//   3. the fake page fixture (tests/fixtures/fake-nyt) mirrors these exactly,
//      so integration tests define the expected shape.
// Last verified against: a saved live Mini page (7×7, 2026-07-04), plus a live toolbar
// capture (2026-07-05): `.xwd__toolbar--wrapper > ul.xwd__toolbar--tools` with
// `li.xwd__tool--button` items; the pencil is `<button><i class=
// "xwd__toolbar_icon--pencil" data-testid="tool-icon"></i></button>` — NO aria-label,
// NO aria-pressed, state unreadable (see REQ-PAGE-012). Notable live facts:
//   - cell state classes (--block/--selected/--highlighted) live on the <rect>, not the <g>;
//   - number/letter <text> elements carry NO distinguishing classes (cellLetter/cellNumber
//     below match nothing live — reader.js reads direct-child <text> own-text instead, and
//     keeps the class path as a fallback for older markup);
//   - each visible <text> nests a hidden aria-live <text class="xwd__cell--hidden"> copy;
//   - key handling is delegated at the app root container, NOT at document level.

export const SEL = {
  board: '.xwd__board, [class*="xwd__board"]',
  cell: 'g.xwd__cell',
  cellRect: 'rect',
  cellLetter: 'text.xwd__cell-letter',
  cellNumber: 'text.xwd__cell-number',
  clueListWrapper: '.xwd__clue-list--wrapper',
  clueListTitle: '.xwd__clue-list--title',
  clueItem: 'li.xwd__clue--li',
  clueLabel: '.xwd__clue--label',
  clueText: '.xwd__clue--text',
  congrats: '.xwd__congrats-modal, [class*="xwd__congrats"]',
  // The puzzle toolbar container (the row with the pencil/check/reveal tools).
  toolbar: '[class*="xwd__toolbar"]',
  // The toolbar pencil-mode toggle (REQ-PAGE-012), by accessible name/tooltip. This is
  // only the FIRST net — use findPencilToggle() below, which adds icon-class and
  // button-text fallbacks, because the live markup for this button is unstable.
  pencilToggle: 'button[aria-label*="pencil" i], button[title*="pencil" i], [role="button"][aria-label*="pencil" i]',
  // Anything pencil-flavored at all (icon <i>/<svg> class, test id); the owning button
  // is found via closest() in findPencilToggle().
  pencilish: '[class*="pencil" i], [data-testid*="pencil" i]',
  // Any element of the crossword app itself. Present even while the pre-puzzle splash
  // ("Ready to start solving?") hides the board — used to tell "puzzle page, still
  // rendering" apart from "not a puzzle page at all".
  app: '[class*="xwd__"]',
  // The pre-puzzle splash/veil containers (REQ-LIFE-016). ⚠️ Best-effort shapes. The
  // live "Ready to start solving?" screen is rendered by the NYT *games shell*, not the
  // crossword app — its classes are in the `pz-` family (pz-moment), so the xwd__ nets
  // alone never matched it (user report, v0.11.2). splash.js additionally requires a
  // Play-ish button inside, and falls back to anchoring on the headline text itself
  // when no class net matches (markup drift must not blind us twice).
  splash: '[class*="xwd__modal"], [class*="xwd__start"], [class*="xwd__veil"], [class*="pz-moment"]',
};

// Our own injected toggle (session-button.js uses this as its id). It borrows the
// pencil's class names for styling, so every pencil hunt below must skip it — else the
// writer could "toggle pencil mode" by clicking the CrosswordChat button.
export const CC_BUTTON_ID = 'crosswordchat-toggle';

/**
 * Find the toolbar's pencil-mode toggle, live-markup-defensively (REQ-PAGE-012).
 * Nets, in order: accessible name/tooltip → pencil-classed descendant's owning button →
 * toolbar button whose text says "pencil". Returns null when nothing matches.
 * @param {Document} document
 * @returns {Element | null}
 */
export function findPencilToggle(document) {
  const ours = (el) => el.closest(`#${CC_BUTTON_ID}`) != null;
  const direct = document.querySelector(SEL.pencilToggle);
  if (direct && !ours(direct)) return direct;
  for (const el of document.querySelectorAll(SEL.pencilish)) {
    const btn = el.closest('button, [role="button"]');
    if (btn && !ours(btn)) return btn;
  }
  for (const btn of document.querySelectorAll(`${SEL.toolbar} button, ${SEL.toolbar} [role="button"]`)) {
    if (!ours(btn) && /pencil/i.test(btn.textContent ?? '')) return btn;
  }
  return null;
}

// Class *names* (no dots) checked via classList / class attribute substrings.
export const CLS = {
  cellBlock: 'xwd__cell--block',
  cellSelected: 'xwd__cell--selected',
  clueSelected: 'xwd__clue--selected',
  // Penciled letters (REQ-PAGE-012): on the letter <text> (or the cell <g>). ⚠️ UNVERIFIED
  // against the live page — same caveat as pencilToggle above. The reader nets ANY
  // pencil-flavored class or data-testid within the cell (substring match), with this
  // exact name kept as the fixture's canonical shape. Because the live marker may not
  // exist at all, answer evaluation additionally remembers the cells the extension
  // itself penciled (the machine's soft-cell ledger, REQ-ANS-023).
  cellPenciled: 'xwd__cell--penciled',
  // Fallback pencil-toggle "on" signal for markup without aria-pressed.
  pencilActive: 'xwd__toolbar--active',
};
