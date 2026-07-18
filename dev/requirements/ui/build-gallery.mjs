// Embed the UI goldens into the requirements doc so it doubles as a gallery of the
// real product surface (spec-driven-product §7). DERIVED, never hand-edited: each
// requirement that wants renders carries a managed marker pair in
// dev/docs/REQUIREMENTS.md —
//
//   <!-- ui-gallery:REQ-LIFE-012 -->
//   <!-- /ui-gallery:REQ-LIFE-012 -->
//
// and this rewrites ONLY the text between them, to the <img> embeds for the cases
// whose `req` matches that id (dev/requirements/ui/cases/*.case.js). Run by
// refresh-snapshots.mjs after the PNGs are (re)generated; a drift test
// (visual-snapshots.test.js) fails if the committed doc doesn't match this output.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadCases } from './cases.js';

const HERE = dirname(fileURLToPath(import.meta.url));
export const REQ_DOC = join(HERE, '..', '..', 'docs', 'REQUIREMENTS.md');

const escapeHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Display width per surface: brand marks small, the settings popup at ~its real
// width, the tall help page scaled down, toolbars wide.
const widthFor = (name) => {
  if (name.startsWith('extension-button')) return 72;
  if (name === 'settings-popup') return 300;
  if (name === 'unsupported-popup') return 300;
  if (name === 'help-page') return 360;
  return 520;
};

// The generated markdown for one requirement id's cases (empty string if none).
function galleryBlock(id, cases) {
  const forId = cases.filter((c) => c.req === id);
  if (!forId.length) return '';
  const out = ['', '_UI goldens — generated from the shipped code by `npm run refresh:ui`:_', ''];
  for (const c of forId) {
    out.push(`<strong>${escapeHtml(c.description)}</strong><br>`);
    out.push(`<img src="../requirements/ui/cases/${c.name}.png" width="${widthFor(c.name)}" alt="${escapeHtml(c.description)}">`);
    out.push('');
  }
  return out.join('\n');
}

// Replace every marker pair's inner content with its generated block.
export function applyGallery(doc, cases) {
  return doc.replace(
    /(<!-- ui-gallery:(REQ-[A-Z]+-\d{3}) -->)[\s\S]*?(<!-- \/ui-gallery:\2 -->)/g,
    (_, open, id, close) => `${open}\n${galleryBlock(id, cases)}\n${close}`,
  );
}

// Rewrite the requirements doc in place. Returns true if it changed.
export async function writeGallery() {
  const cases = await loadCases();
  const before = readFileSync(REQ_DOC, 'utf8');
  const after = applyGallery(before, cases);
  if (after !== before) writeFileSync(REQ_DOC, after);
  return after !== before;
}
