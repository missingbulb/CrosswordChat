// Normalization: raw speech transcripts → crossword-comparable letter strings.
// Pure functions, no browser APIs.

const ONES = ['ZERO', 'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE',
  'TEN', 'ELEVEN', 'TWELVE', 'THIRTEEN', 'FOURTEEN', 'FIFTEEN', 'SIXTEEN', 'SEVENTEEN',
  'EIGHTEEN', 'NINETEEN'];
const TENS = ['', '', 'TWENTY', 'THIRTY', 'FORTY', 'FIFTY', 'SIXTY', 'SEVENTY', 'EIGHTY', 'NINETY'];
const ORDINAL_ONES = ['ZEROTH', 'FIRST', 'SECOND', 'THIRD', 'FOURTH', 'FIFTH', 'SIXTH', 'SEVENTH',
  'EIGHTH', 'NINTH', 'TENTH', 'ELEVENTH', 'TWELFTH', 'THIRTEENTH', 'FOURTEENTH', 'FIFTEENTH',
  'SIXTEENTH', 'SEVENTEENTH', 'EIGHTEENTH', 'NINETEENTH'];
const ORDINAL_TENS = ['', '', 'TWENTIETH', 'THIRTIETH', 'FORTIETH', 'FIFTIETH', 'SIXTIETH',
  'SEVENTIETH', 'EIGHTIETH', 'NINETIETH'];

function twoDigitWord(n) {
  if (n < 20) return ONES[n];
  const t = Math.floor(n / 10);
  const r = n % 10;
  return TENS[t] + (r ? ONES[r] : '');
}

/**
 * Integer → spoken-word letters, using crossword/year conventions (REQ-ANS-002):
 *   8 → EIGHT, 42 → FORTYTWO, 305 → THREEHUNDREDFIVE,
 *   1984 → NINETEENEIGHTYFOUR, 1900 → NINETEENHUNDRED, 1905 → NINETEENOHFIVE,
 *   2001 → TWOTHOUSANDONE, 2024 → TWENTYTWENTYFOUR.
 * Anything else falls back to per-digit words.
 */
export function numberToWord(n) {
  if (!Number.isInteger(n) || n < 0) return null;
  if (n <= 99) return twoDigitWord(n);
  if (n <= 999) {
    const h = Math.floor(n / 100);
    const r = n % 100;
    return ONES[h] + 'HUNDRED' + (r ? twoDigitWord(r) : '');
  }
  if (n >= 1100 && n <= 1999) {
    const hi = Math.floor(n / 100);
    const lo = n % 100;
    if (lo === 0) return twoDigitWord(hi) + 'HUNDRED';
    if (lo < 10) return twoDigitWord(hi) + 'OH' + ONES[lo];
    return twoDigitWord(hi) + twoDigitWord(lo);
  }
  if (n >= 2000 && n <= 2009) return 'TWOTHOUSAND' + (n % 100 ? ONES[n % 100] : '');
  if (n >= 2010 && n <= 2099) return 'TWENTY' + twoDigitWord(n % 100);
  return String(n).split('').map((d) => ONES[Number(d)]).join('');
}

/** '1st' → FIRST, '22nd' → TWENTYSECOND (0–99; null outside). */
export function ordinalToWord(n) {
  if (!Number.isInteger(n) || n < 0 || n > 99) return null;
  if (n < 20) return ORDINAL_ONES[n];
  const t = Math.floor(n / 10);
  const r = n % 10;
  return r ? TENS[t] + ORDINAL_ONES[r] : ORDINAL_TENS[t];
}

/**
 * Lowercased, punctuation-free, single-spaced form used for command matching.
 * Apostrophes are removed (not spaced): "we're done" → "were done".
 */
export function normalizeUtterance(text) {
  return String(text ?? '')
    .toLowerCase()
    .replace(/[’‘']/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Transcript → array of normalized answer tokens (uppercase A–Z words).
 * Digits and ordinals become words (REQ-ANS-002); punctuation dies (REQ-ANS-001).
 * "It's 8 a lot" → ['ITS', 'EIGHT', 'A', 'LOT']
 */
export function normalizedTokens(text) {
  const raw = String(text ?? '')
    .toLowerCase()
    .replace(/[’‘']/g, '')
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  const out = [];
  for (const tok of raw) {
    const ord = tok.match(/^(\d+)(st|nd|rd|th)$/);
    if (ord) {
      const w = ordinalToWord(Number(ord[1]));
      if (w) out.push(w);
      continue;
    }
    if (/^\d+$/.test(tok)) {
      const w = numberToWord(Number(tok));
      if (w) out.push(w);
      continue;
    }
    const letters = tok.toUpperCase().replace(/[^A-Z]/g, '');
    if (letters) out.push(letters);
  }
  return out;
}

/** Transcript → single normalized candidate word (the "literal"). "a lot" → ALOT (REQ-ANS-015). */
export function toLetters(text) {
  return normalizedTokens(text).join('');
}
