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
// Full cell capture (user-provided, 2026-07-05), the richest live sample so far:
//   <g class="xwd__cell" data-testid="cell-g">
//     <rect role="cell" tabindex="-1" id="cell-id-3"
//           aria-label="5D: Cubes have twelve of them, Answer: 5 letters, Letter: 0"
//           class="xwd__cell--cell xwd__cell--penciled xwd__cell--nested" …/>
//     <text … data-testid="cell-text"><text class="xwd__cell--hidden" …></text>4</text>
//     <text … data-testid="cell-text"><text class="xwd__cell--hidden" …>A</text>A</text>
//   </g>
// So: the PENCIL marker is xwd__cell--penciled ON THE RECT; the rect also offers
// role="cell", id="cell-id-N", and an aria-label naming the clue + answer length
// (untapped fallback hooks); the text pair carries data-testid="cell-text".

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
  // The modal/moment families a page verdict can arrive in (congrats, "Keep trying",
  // splash — REQ-LIFE-005/006/016). ⚠️ Best-effort; consumers pair this with text
  // and visibility checks.
  modal: '[class*="xwd__modal"], [class*="pz-moment"]',
  // The pre-puzzle splash/veil containers (REQ-LIFE-016). ✅ pz-moment VERIFIED live
  // (user capture, 2026-07-05): the "Ready to start solving?" screen is rendered by
  // the NYT *games shell*, not the crossword app — `pz-moment__content` holds a title
  // (the PUZZLE NAME, e.g. "The Midi"), the headline copy in `pz-moment__description`,
  // and a Play button whose classes are build-hashed CSS-module names
  // (`_momentButton_e4jbe_2 _primary_e4jbe_37 …`) — NO stable class hook, which is why
  // splash.js matches the button by its TEXT/aria name. The xwd__ shapes stay as
  // legacy nets, and splash.js additionally anchors on the headline text itself when
  // no class net matches (markup drift must not blind us twice — v0.11.2).
  splash: '[class*="xwd__modal"], [class*="xwd__start"], [class*="xwd__veil"], [class*="pz-moment"]',
};

// Our own injected toggle (session-button.js uses this as its id). It borrows the
// pencil's class names for styling, so every pencil hunt below must skip it — else the
// writer could "toggle pencil mode" by clicking the CrosswordChat button.
export const CC_BUTTON_ID = 'crosswordchat-toggle';

/**
 * Visible in the CSS sense — walks up, since display:none does not inherit. Used by
 * every popup detector (splash, verdicts): a dismissed moment the page merely hides
 * must read as gone.
 * @param {Element} el
 */
export function isVisible(el) {
  const view = el.ownerDocument?.defaultView;
  for (let node = el; node && node.nodeType === 1; node = node.parentElement) {
    if (node.hidden) return false;
    const style = view?.getComputedStyle?.(node);
    if (style && (style.display === 'none' || style.visibility === 'hidden')) return false;
  }
  return true;
}

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
  // Penciled letters (REQ-PAGE-012). ✅ VERIFIED live (user capture, 2026-07-05): the
  // marker rides the cell <rect>, alongside the base classes —
  //   class="xwd__cell--cell xwd__cell--penciled xwd__cell--nested"
  // The reader nets ANY pencil-flavored class or data-testid on the <g>, the <rect>, or
  // the letter <text> (substring match, so a rename/move survives), with this exact
  // name as the canonical shape the fixture mirrors. Answer evaluation additionally
  // remembers the cells the extension itself penciled (the machine's soft-cell ledger,
  // REQ-ANS-023) — belt and braces against the next drift.
  cellPenciled: 'xwd__cell--penciled',
  // Fallback pencil-toggle "on" signal for markup without aria-pressed.
  pencilActive: 'xwd__toolbar--active',
};
