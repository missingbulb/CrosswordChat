// Render the injected-button-in-toolbar surface: load the committed real NYT
// toolbar sample (fixtures/nyt-toolbar.html), inject the REAL session button with
// the shipped mountSessionButton (proving the placement, not a hand-placed copy),
// inline the toolbar's model CSS (satori has no CSS engine — mirrors GCEC's
// popup.css inlining), and rasterize the toolbar row via satori+resvg.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { JSDOM } from 'jsdom';
import { mountSessionButton, BUTTON_ID } from '../../../extension/src/page-adapter/session-button.js';
import { domToPng } from './dom-to-png.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(HERE, '..', 'fixtures');
const TOOLBAR_HTML = readFileSync(join(FIXTURES, 'nyt-toolbar.html'), 'utf8');
const TOOLBAR_CSS = readFileSync(join(FIXTURES, 'nyt-toolbar.css'), 'utf8');

// Fixed render width — the captured Mini toolbar's content fits within this; the
// remainder is white, like the toolbar's own background. Pinned for determinism.
const WIDTH = 780;

// Flat CSS -> [{selector, body}] (comma-separated selectors split out). The model
// stylesheet has no media queries or nesting, so this stays simple.
function parseCssRules(css) {
  const rules = [];
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const re = /([^{}]+)\{([^{}]+)\}/g;
  let m;
  while ((m = re.exec(clean))) {
    const body = m[2].trim();
    for (const sel of m[1].split(',')) rules.push({ selector: sel.trim(), body });
  }
  return rules;
}

const RULES = parseCssRules(TOOLBAR_CSS);

// NYT's tool glyphs are an icon webfont this repo doesn't ship, so substitute a
// simple inline SVG per slot — enough to read as the real toolbar (§6: a labeled
// model, not NYT's exact art). Keyed by the icon <i>'s class.
const ICON_SVGS = {
  'xwd__toolbar_icon--settings-gear': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20"><path fill="#121212" d="M19.14 12.94c.04-.31.06-.63.06-.94s-.02-.63-.06-.94l2.03-1.58a.5.5 0 0 0 .12-.62l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.5.5 0 0 0-.5-.42h-3.84a.5.5 0 0 0-.5.42l-.36 2.54c-.59.24-1.13.56-1.62.94l-2.39-.96a.5.5 0 0 0-.6.22L2.74 8.86a.5.5 0 0 0 .12.62l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58a.5.5 0 0 0-.12.62l1.92 3.32c.14.24.42.34.66.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.25.42.5.42h3.84c.25 0 .45-.18.5-.42l.36-2.54c.59-.24 1.12-.56 1.62-.94l2.39.96c.24.12.52.02.66-.22l1.92-3.32a.5.5 0 0 0-.12-.62l-2.03-1.58zM12 15.5A3.5 3.5 0 1 1 12 8.5a3.5 3.5 0 0 1 0 7z"/></svg>',
  'pz-icon-pause': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16"><rect x="6" y="5" width="4" height="14" rx="1" fill="#8a8a8a"/><rect x="14" y="5" width="4" height="14" rx="1" fill="#8a8a8a"/></svg>',
  'xwd__toolbar_icon--support': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="21" height="21"><circle cx="12" cy="12" r="9.4" fill="none" stroke="#121212" stroke-width="1.6"/><path d="M9.1 9.2a2.9 2.9 0 0 1 5.5 1.1c0 1.9-2.5 2-2.5 3.5" fill="none" stroke="#121212" stroke-width="1.6" stroke-linecap="round"/><circle cx="12" cy="17.2" r="1.15" fill="#121212"/></svg>',
  'xwd__toolbar_icon--pencil': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="21" height="21"><path d="M4 20h4L18.5 9.5l-4-4L4 16v4z" fill="none" stroke="#121212" stroke-width="1.6" stroke-linejoin="round"/><path d="M13.5 6.5l4 4" fill="none" stroke="#121212" stroke-width="1.6"/></svg>',
};

// The split button's caret glyph (▾) isn't in the bundled font — draw it as a
// small SVG triangle so it renders instead of tofu.
const CARET_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 6" width="10" height="6"><path d="M0 0 L5 6 L10 0 Z" fill="#121212"/></svg>';

function substituteIcons(rootEl) {
  for (const [cls, svg] of Object.entries(ICON_SVGS)) {
    for (const el of rootEl.querySelectorAll(`.${cls}`)) el.innerHTML = svg;
  }
  const caret = rootEl.querySelector('[data-cc-role="caret"]');
  if (caret) caret.innerHTML = CARET_SVG;
}

// Fold the stylesheet onto the subtree as inline styles. Each element's own inline
// style is appended LAST so it wins — the injected button's shipped inline styles
// must survive the model CSS.
function inlineCss(rootEl) {
  for (const { selector, body } of RULES) {
    let matched;
    try {
      matched = rootEl.querySelectorAll(selector);
    } catch {
      continue; // a selector jsdom can't evaluate — skip
    }
    for (const el of matched) el.setAttribute('style', `${body};${el.getAttribute('style') || ''}`);
    if (rootEl.matches(selector)) rootEl.setAttribute('style', `${body};${rootEl.getAttribute('style') || ''}`);
  }
}

/**
 * @param {{active?: boolean, menuOpen?: boolean}} [opts]
 *   active — render the session as running (inverted tile);
 *   menuOpen — open the caret dropdown (Activate/Settings/Voice commands)
 * @returns {Promise<Buffer>} PNG bytes of the toolbar row with the button injected
 */
export async function renderToolbar({ active = false, menuOpen = false } = {}) {
  const dom = new JSDOM(`<!DOCTYPE html><html><body>${TOOLBAR_HTML}</body></html>`, {
    url: 'https://www.nytimes.com/crosswords/game/mini',
  });
  const doc = dom.window.document;
  try {
    // The shipped injector finds the pencil and mounts the split button right after
    // it. Handlers are no-ops here — the golden asserts appearance, not behavior.
    const handle = mountSessionButton(doc, { onToggle() {}, onSettings() {}, onHelp() {} }, { floatAfterMs: 0 });
    if (active) handle.setActive(true);
    // Drive the real open path so the golden shows the menu the shipped code builds.
    if (menuOpen) doc.querySelector(`#${BUTTON_ID} [data-cc-role="caret"]`).click();

    const wrapper = doc.querySelector('.xwd__toolbar--wrapper');
    substituteIcons(wrapper);
    inlineCss(wrapper);
    // The open dropdown is absolutely positioned below the row (out of flow), so
    // give that render enough canvas height for the menu to show unclipped.
    return await domToPng(wrapper, { width: WIDTH, height: menuOpen ? 190 : undefined, background: '#ffffff' });
  } finally {
    dom.window.close();
  }
}
