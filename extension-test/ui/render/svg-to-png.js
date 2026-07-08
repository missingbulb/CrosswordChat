// Rasterize an SVG string to a PNG buffer with resvg — no browser, no system
// fonts, so the bytes are deterministic across machines (a golden can demand an
// EXACT match). Used for surfaces that ARE an SVG the shipped code emits: the
// CrosswordChat brand mark that the toolbar action icon and the in-page button
// share (extension/src/shared/brand-icon.js). The golden is the real vector art
// rasterized, never a hand-drawn copy.

import { Resvg } from '@resvg/resvg-js';

// The shipped mark carries valueless marker attributes (`data-cc-bg`,
// `data-cc-bubble`) — legal for SVG inlined into an HTML page, but resvg parses
// strict XML and rejects a boolean attribute. Give those known markers an empty
// value so the SVG is well-formed XML; the result is pixel-identical (data-*
// attributes never paint) and structurally the same tree.
const xmlSafe = (svg) => svg.replace(/(data-cc-[a-z]+)(?=[\s/>])/g, '$1=""');

/**
 * @param {string} svg   a self-contained SVG string (no external refs/fonts)
 * @param {{width?: number}} [opts]  target pixel width; height follows the viewBox
 * @returns {Buffer} PNG bytes
 */
export function svgToPng(svg, { width = 128 } = {}) {
  return new Resvg(xmlSafe(svg), {
    fitTo: { mode: 'width', value: width },
    font: { loadSystemFonts: false }, // determinism: never reach for host fonts
  })
    .render()
    .asPng();
}
