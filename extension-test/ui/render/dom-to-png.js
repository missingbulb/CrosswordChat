// Rasterize a jsdom element subtree to a PNG buffer via satori (HTML/CSS-subset ->
// SVG) + resvg (SVG -> PNG), with bundled fonts — no browser, so the output is
// deterministic and a golden can demand an exact match. Used for the in-page
// surface: the REAL mountSessionButton injected into a committed, inline-styled
// snapshot of the NYT toolbar (extension-test/ui/fixtures/nyt-toolbar.html).
//
// satori has NO CSS engine: it ignores <style>/<link> and reads only inline
// styles. That is exactly why the toolbar fixture is captured with computed styles
// already flattened inline, and why our injected button is safe to render — it is
// inline-styled and host-CSS-independent by design (brand-icon.js). An <svg> child
// (the brand mark) is re-emitted as an <img> of a data-URI SVG, which satori
// rasterizes through resvg.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';

const FONT_DIR = join(dirname(fileURLToPath(import.meta.url)), 'fonts');
const FONT_FAMILY = 'Liberation Sans'; // metric-compatible stand-in for Arial/Helvetica stacks
const FONTS = [
  { name: FONT_FAMILY, data: readFileSync(join(FONT_DIR, 'LiberationSans-Regular.ttf')), weight: 400, style: 'normal' },
  { name: FONT_FAMILY, data: readFileSync(join(FONT_DIR, 'LiberationSans-Bold.ttf')), weight: 700, style: 'normal' },
  { name: FONT_FAMILY, data: readFileSync(join(FONT_DIR, 'LiberationSans-Italic.ttf')), weight: 400, style: 'italic' },
];

const camel = (p) => p.trim().replace(/-([a-z])/g, (_, c) => c.toUpperCase());

function coerceValue(v) {
  v = v.trim();
  if (/^-?\d+(\.\d+)?px$/.test(v)) return parseFloat(v);
  if (/^-?\d+(\.\d+)?$/.test(v)) return parseFloat(v);
  return v;
}

// satori validates `display` against a fixed set; anything else (inline-block,
// inline-flex, table, …) is dropped so the box falls back to its default, and the
// >1-child rule below still forces flex where structurally required.
const SATORI_DISPLAY = new Set(['flex', 'block', 'contents', 'none', '-webkit-box']);

// Inline style string -> satori style object. Keep every declaration (satori
// ignores what it can't use), except an unsupported `display` value.
function styleObject(styleAttr) {
  const out = {};
  for (const decl of (styleAttr || '').split(';')) {
    const i = decl.indexOf(':');
    if (i < 0) continue;
    const prop = decl.slice(0, i).trim();
    const value = decl.slice(i + 1).trim();
    if (!prop || !value) continue;
    const key = camel(prop);
    if (key === 'display' && !SATORI_DISPLAY.has(value)) continue;
    out[key] = coerceValue(value);
  }
  return out;
}

const FLEXY = ['flex', 'none', 'contents'];

// A rendered <svg> (the brand mark) -> a satori <img> of its data-URI, sized from
// its width/height attributes (falling back to the viewBox).
function svgToImgNode(el) {
  const style = styleObject(el.getAttribute('style'));
  let width = Number(el.getAttribute('width')) || style.width;
  let height = Number(el.getAttribute('height')) || style.height;
  if (!width || !height) {
    const vb = (el.getAttribute('viewBox') || '').split(/[\s,]+/).map(Number);
    if (vb.length === 4) {
      width = width || vb[2];
      height = height || vb[3];
    }
  }
  const src = `data:image/svg+xml;base64,${Buffer.from(el.outerHTML).toString('base64')}`;
  return { type: 'img', props: { src, width, height, style } };
}

// jsdom element -> satori element tree. Tag is irrelevant to satori (it lays out
// boxes from styles), so a general element becomes a div; an <svg> becomes an
// <img>; text nodes become string children (whitespace collapsed).
function toVDom(el) {
  const tag = (el.tagName || '').toLowerCase();
  if (tag === 'svg') return svgToImgNode(el);
  if (tag === 'img') {
    const style = styleObject(el.getAttribute('style'));
    return {
      type: 'img',
      props: { src: el.getAttribute('src'), width: Number(el.getAttribute('width')) || style.width, height: Number(el.getAttribute('height')) || style.height, style },
    };
  }

  const style = styleObject(el.getAttribute('style'));
  const children = [];
  for (const node of el.childNodes) {
    if (node.nodeType === 3) {
      const t = node.textContent.replace(/\s+/g, ' ').trim();
      if (t) children.push(t);
    } else if (node.nodeType === 1) {
      children.push(toVDom(node));
    }
  }
  // satori's one structural requirement: any box laying out child BOXES (an
  // element child, or >1 child) needs an explicit flex/none/contents display. A
  // toolbar is a horizontal row, so default those to a flex row; the captured
  // computed styles usually already carry an explicit display and win.
  const loneTextChild = children.length === 1 && typeof children[0] === 'string';
  if (children.length > 0 && !loneTextChild && !FLEXY.includes(style.display)) {
    style.display = 'flex';
    if (!style.flexDirection) style.flexDirection = 'row';
  }
  const childProp = children.length === 0 ? undefined : children.length === 1 ? children[0] : children;
  return { type: 'div', props: { style, children: childProp } };
}

/**
 * Rasterize a jsdom element subtree to PNG bytes.
 * @param {Element} rootEl  the element to render (e.g. the toolbar wrapper)
 * @param {{width: number, background?: string}} opts
 *   width — fixed render width in px (pin it for determinism);
 *   background — fill for any area the boxes don't cover (default transparent)
 * @returns {Promise<Buffer>} PNG bytes
 */
export async function domToPng(rootEl, { width, background }) {
  const vdom = toVDom(rootEl);
  vdom.props.style = { fontFamily: FONT_FAMILY, ...vdom.props.style };
  const svg = await satori(vdom, { width, fonts: FONTS });
  const resvg = new Resvg(svg, {
    font: { loadSystemFonts: false },
    ...(background ? { background } : {}),
  });
  return resvg.render().asPng();
}
