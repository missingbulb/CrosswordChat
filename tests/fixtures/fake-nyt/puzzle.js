// Fixture puzzle: a 5×5 word square (every row and column is a word), so all ten
// entries have real crossings. Clues deliberately exercise the formatting cases from
// REQUIREMENTS §6: italics, brackets, question mark, underscores/quotes/entities.

export const FIXTURE_PUZZLE = {
  rows: 5,
  cols: 5,
  // '#' would be a block; this grid has none (like a typical Mini).
  solution: [
    'HEART',
    'EMBER',
    'ABUSE',
    'RESIN',
    'TREND',
  ],
  across: [
    { number: 1, html: 'Organ with four chambers' },
    { number: 6, html: 'Dying <i>fire</i> bit' },
    { number: 7, html: '[Treat badly]' },
    { number: 8, html: 'Sticky stuff on a violin bow' },
    { number: 9, html: 'It might go viral?' },
  ],
  down: [
    { number: 1, html: '&ldquo;The ___ of the Matter&rdquo; (Don Henley hit)' },
    { number: 2, html: 'Glowing coal' },
    { number: 3, html: 'Verbal attack, e.g.' },
    { number: 4, html: 'Tree ooze' },
    { number: 5, html: 'Fashion direction' },
  ],
};
