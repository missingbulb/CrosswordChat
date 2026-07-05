// The CrosswordChat mark — a speech bubble that is itself a crossword grid — as one
// shared SVG builder, so the in-page toolbar button (REQ-LIFE-012), the action icons,
// and the store assets (tools/make-store-assets.mjs) can never drift apart.
// Pure string building; no DOM, no browser APIs.

export const GOLD = '#F2C53D'; // crossword gold
export const INK = '#191919'; // near-black

// Bubble outline: body 22..106 × 20..92, with a tail dropping to (40, 110).
const BUBBLE = 'M34 20 h60 a12 12 0 0 1 12 12 v48 a12 12 0 0 1 -12 12 H62 L40 110 V92 '
  + 'h-6 a12 12 0 0 1 -12 -12 V32 a12 12 0 0 1 12 -12 z';

// The bottom edge continued across the tail's opening (drawn with the outline), so the
// tail reads as a closed triangle hanging under a complete rounded rect — and the left
// grid vertical (x=50) ends ON that edge instead of floating mid-air inside the tail.
const CLOSE_TAIL = 'M36 92 H66';

// Grid strokes (2 verticals + 1 horizontal → 3×2 cells); every end lands on an edge.
const GRID = 'M50 20 V92 M78 20 V92 M22 56 H108';

/**
 * @param {{bg: string, ink: string, bubble: string, size?: number}} opts
 *   bg — tile background · ink — outline/grid/black square · bubble — bubble fill ·
 *   size — optional width/height attributes (viewBox is always 128)
 */
export function brandIconSvg({ bg, ink, bubble, size }) {
  const dims = size ? ` width="${size}" height="${size}"` : '';
  return `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"${dims} aria-hidden="true" focusable="false">
  <rect data-cc-bg width="128" height="128" rx="27" fill="${bg}"/>
  <defs><clipPath id="cc-bubble-clip"><path d="${BUBBLE}"/></clipPath></defs>
  <path data-cc-bubble d="${BUBBLE}" fill="${bubble}"/>
  <g clip-path="url(#cc-bubble-clip)">
    <rect x="78" y="20" width="30" height="36" fill="${ink}"/>
    <path d="${GRID}" stroke="${ink}" stroke-width="6"/>
  </g>
  <path d="${BUBBLE} ${CLOSE_TAIL}" fill="none" stroke="${ink}" stroke-width="8" stroke-linejoin="round"/>
</svg>`;
}
