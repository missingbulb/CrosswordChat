// The CrosswordChat mark — a speech bubble that is itself a crossword grid — as one
// shared SVG builder, so the in-page toolbar button (REQ-LIFE-012), the action icons,
// and the store assets (tools/make-store-assets.mjs) can never drift apart.
// Pure string building; no DOM, no browser APIs.
//
// Injection hardening: this SVG gets inlined into the NYT page (REQ-LIFE-012), so it
// must survive a hostile host document. Two rules follow:
//   1. No <clipPath>/url(#id) references — fragment URLs resolve against the page's
//      base URL (<base>, pushState rewrites), and a broken reference silently erases
//      the clipped shapes. Everything is drawn with plain geometry instead.
//   2. Every paint is set BOTH as a presentation attribute and as an inline style —
//      any page CSS rule outranks presentation attributes, but not inline styles.

export const GOLD = '#F2C53D'; // crossword gold
export const INK = '#191919'; // near-black

// Bubble outline: body 22..106 × 20..92, with a tail dropping to (40, 110).
const BUBBLE = 'M34 20 h60 a12 12 0 0 1 12 12 v48 a12 12 0 0 1 -12 12 H62 L40 110 V92 '
  + 'h-6 a12 12 0 0 1 -12 -12 V32 a12 12 0 0 1 12 -12 z';

// The bottom edge continued across the tail's opening (drawn with the outline), so the
// tail reads as a closed triangle hanging under a complete rounded rect — and the left
// grid vertical (x=50) ends ON that edge instead of floating mid-air inside the tail.
const CLOSE_TAIL = 'M36 92 H66';

// Grid strokes (2 verticals + 1 horizontal → 3×2 cells); every end lands exactly on a
// bubble edge (top y=20, bottom y=92, sides x=22/x=106), so no clipping is needed.
const GRID = 'M50 20 V92 M78 20 V92 M22 56 H106';

// The black square (top-right cell), following the bubble's rounded corner exactly —
// its own closed path in place of the old clipped over-wide rect.
const BLACK_SQUARE = 'M78 20 H94 a12 12 0 0 1 12 12 V56 H78 z';

/**
 * @param {{bg: string, ink: string, bubble: string, size?: number}} opts
 *   bg — tile background · ink — outline/grid/black square · bubble — bubble fill ·
 *   size — optional width/height attributes (viewBox is always 128)
 */
export function brandIconSvg({ bg, ink, bubble, size }) {
  const dims = size ? ` width="${size}" height="${size}"` : '';
  const rootStyle = `display:block${size ? `;width:${size}px;height:${size}px` : ''}`;
  const fill = (color) => `fill="${color}" style="fill:${color}"`;
  const stroke = (color, width, extra = '') =>
    `fill="none" stroke="${color}" stroke-width="${width}"${extra} `
    + `style="fill:none;stroke:${color};stroke-width:${width}px"`;
  return `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"${dims} style="${rootStyle}" aria-hidden="true" focusable="false">
  <rect data-cc-bg width="128" height="128" rx="27" ${fill(bg)}/>
  <path data-cc-bubble d="${BUBBLE}" ${fill(bubble)}/>
  <path d="${BLACK_SQUARE}" ${fill(ink)}/>
  <path d="${GRID}" ${stroke(ink, 6)}/>
  <path d="${BUBBLE} ${CLOSE_TAIL}" ${stroke(ink, 8, ' stroke-linejoin="round"')}/>
</svg>`;
}
