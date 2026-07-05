// The pre-puzzle splash ("Ready to start solving?" with a Play button) hides the
// board until clicked (REQ-LIFE-016). Best-effort dismissal: find the Play-ish button
// in the modal, click it like a user would, and report whether the splash cleared —
// a page without a recognizable splash is simply "clear".
//
// Detection is belt and braces, because the live splash's class family has drifted
// out from under the selector nets before (v0.11.2 user report):
//   1. class nets (SEL.splash: xwd__ modal family + the games shell's pz-moment family),
//   2. the headline text itself — any visible container holding "Ready to start
//      solving" plus a Play-ish button counts, whatever its classes are called.
// Either way a splash only counts while it is VISIBLE: pages that hide the dismissed
// moment with display:none instead of removing it must read as "clear".

import { SEL, isVisible as visible } from './selectors.js';
import { clickCell } from './writer.js';

const PLAY_WORDS = /^(play|play now|continue|resume|start|keep trying|begin)/i;
const SPLASH_TEXT = /ready to start solving/i;

const settle = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** The first visible Play-ish button inside `container`, or null. */
function playButtonIn(container) {
  for (const btn of container.querySelectorAll('button, [role="button"]')) {
    const name = `${btn.getAttribute('aria-label') ?? ''} ${btn.textContent ?? ''}`.trim();
    if (PLAY_WORDS.test(name) && visible(btn)) return btn;
  }
  return null;
}

/** The splash's Play/Continue button, or null when no splash is in the way. */
export function findSplashPlayButton(document) {
  for (const container of document.querySelectorAll(SEL.splash)) {
    const btn = playButtonIn(container);
    if (btn) return btn;
  }
  // Text-anchored fallback: find the headline, then climb to the container that
  // offers the button. The cheap body-text gate keeps the poll loop light.
  if (!SPLASH_TEXT.test(document.body?.textContent ?? '')) return null;
  for (const el of document.body.querySelectorAll('*')) {
    // Only rendered copy anchors — the phrase also lives in server-rendered JSON.
    if (/^(script|style|noscript|template)$/i.test(el.tagName)) continue;
    if (!SPLASH_TEXT.test(el.textContent ?? '')) continue;
    if ([...el.children].some((child) => SPLASH_TEXT.test(child.textContent ?? ''))) continue;
    if (!visible(el)) continue;
    let node = el;
    for (let hops = 0; node && node !== document.body && hops < 6; hops++, node = node.parentElement) {
      const btn = playButtonIn(node);
      if (btn) return btn;
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
