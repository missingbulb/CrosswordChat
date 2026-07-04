// Every NYT DOM selector/class in one file (REQ-PAGE-011).
//
// ⚠️ These are best-effort observations of the NYT crossword markup (the `xwd__`
// class family) and WILL drift when NYT redesigns. The contract is:
//   1. run probe() (panel "Probe page" button / MT-01) after any breakage,
//   2. fix values HERE only,
//   3. the fake page fixture (tests/fixtures/fake-nyt) mirrors these exactly,
//      so integration tests define the expected shape.
// Last verified against: the fake fixture (live verification pending — MT-01).

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
