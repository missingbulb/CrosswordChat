// Clue selection via the page's own clue list (REQ-PAGE-005 / REQ-NAV-007).

import { SEL } from './selectors.js';
import { clickCell } from './writer.js';

/**
 * Click the clue-list item for clueId (e.g. 'D3') so the page highlights it.
 * @returns {boolean} found & clicked
 */
export function selectClue(document, clueId) {
  const m = /^([AD])(\d+)$/.exec(clueId);
  if (!m) return false;
  const wantDirection = m[1] === 'A' ? 'a' : 'd';
  const wantNumber = m[2];
  for (const wrapper of document.querySelectorAll(SEL.clueListWrapper)) {
    const title = (wrapper.querySelector(SEL.clueListTitle)?.textContent ?? '').trim().toLowerCase();
    if (!title.startsWith(wantDirection)) continue;
    for (const item of wrapper.querySelectorAll(SEL.clueItem)) {
      const label = (item.querySelector(SEL.clueLabel)?.textContent ?? '').trim();
      if (label === wantNumber) {
        clickCell(item);
        return true;
      }
    }
  }
  return false;
}
