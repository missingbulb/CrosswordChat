// The pre-puzzle splash ("Ready to start solving?" with a Play button) hides the
// board until clicked (REQ-LIFE-016). Best-effort dismissal: find the Play-ish button
// in the modal, click it like a user would, and report whether the splash cleared —
// a page without a recognizable splash is simply "clear".

import { SEL } from './selectors.js';
import { clickCell } from './writer.js';

const PLAY_WORDS = /^(play|play now|continue|resume|start|keep trying|begin)/i;

const settle = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** The splash's Play/Continue button, or null when no splash is in the way. */
export function findSplashPlayButton(document) {
  for (const container of document.querySelectorAll(SEL.splash)) {
    for (const btn of container.querySelectorAll('button, [role="button"]')) {
      const name = `${btn.getAttribute('aria-label') ?? ''} ${btn.textContent ?? ''}`.trim();
      if (PLAY_WORDS.test(name)) return btn;
    }
  }
  return null;
}

/**
 * Click the splash's Play button (when present) and wait for the splash to clear.
 * @returns {Promise<boolean>} true when no splash remains (or none existed).
 */
export async function dismissSplash(document, { waitMs = 4000, pollMs = 100 } = {}) {
  const btn = findSplashPlayButton(document);
  if (!btn) return true;
  clickCell(btn); // full mousedown/mouseup/click, like every other page write
  const deadline = Date.now() + waitMs;
  while (Date.now() < deadline) {
    if (!findSplashPlayButton(document)) return true;
    await settle(pollMs);
  }
  return false;
}

/** Wait (without clicking) for the user to clear the splash themselves. */
export async function waitForSplashClear(document, { waitMs = 60_000, pollMs = 250 } = {}) {
  const deadline = Date.now() + waitMs;
  while (Date.now() < deadline) {
    if (!findSplashPlayButton(document)) return true;
    await settle(pollMs);
  }
  return false;
}
