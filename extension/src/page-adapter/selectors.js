// Every NYT DOM selector/class in one file (REQ-PAGE-011).
//
// ⚠️ These are best-effort observations of the NYT crossword markup (the `xwd__`
// class family) and WILL drift when NYT redesigns. The contract is:
//   1. run probe() (panel "Probe page" button / MT-01) after any breakage,
//   2. fix values HERE only,
//   3. the fake page fixture (tests/fixtures/fake-nyt) mirrors these exactly,
//      so integration tests define the expected shape.
// Last verified against: a saved live Mini page (7×7, 2026-07-04). Notable live facts:
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
};

// Class *names* (no dots) checked via classList / class attribute substrings.
export const CLS = {
  cellBlock: 'xwd__cell--block',
  cellSelected: 'xwd__cell--selected',
  clueSelected: 'xwd__clue--selected',
};
