// The NYT crossword auto-pauses (REQ-LIFE-017): after a stretch with no keystrokes the
// games shell veils the board behind a "Your puzzle is paused" overlay with a Resume
// button, freezing the timer. This is a THINKING game hosted by voice — long silences
// at the keyboard are normal (the user is talking to us, not away), so a session that
// hit that veil would dead-end mid-conversation. We resume it for the user, the same
// click-like-a-user way splash.js clears the pre-puzzle veil.
//
// A real look-away instead ENDS the session (REQ-LIFE-011: tab blur/hide), which stops
// the watcher — so auto-resume only ever fires while the tab is genuinely in front of
// the user, never fighting a pause the user actually wants.
//
// Detection is belt and braces (cf. splash.js — the NYT moment class family has drifted
// before): the class nets (the pz-moment / xwd__modal families), gated to a VISIBLE
// overlay whose copy says "paused" — the distinctive word that tells a pause veil apart
// from the splash or a verdict popup — plus a text anchor that survives the next rename.

import { SEL, isVisible as visible } from './selectors.js';
import { clickCell } from './writer.js';

const PAUSE_TEXT = /paused/i;
// The button that lifts the veil. "Resume" is the live label; the neighbors keep us from
// being blinded by a rename. (Not "play" — that is the splash's word, REQ-LIFE-016.)
const RESUME_WORDS = /^(resume|keep going|continue|unpause)\b/i;

const settle = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** The first visible Resume-ish button inside `container`, or null. */
function resumeButtonIn(container) {
  for (const btn of container.querySelectorAll('button, [role="button"]')) {
    const name = `${btn.getAttribute('aria-label') ?? ''} ${btn.textContent ?? ''}`.trim();
    if (RESUME_WORDS.test(name) && visible(btn)) return btn;
  }
  return null;
}

/** The pause overlay's Resume button, or null when the puzzle is not paused. */
export function findResumeButton(document) {
  // Class nets first, gated to a visible overlay whose copy says "paused".
  for (const container of document.querySelectorAll(SEL.splash)) {
    if (!visible(container) || !PAUSE_TEXT.test(container.textContent ?? '')) continue;
    const btn = resumeButtonIn(container);
    if (btn) return btn;
  }
  // Text-anchored fallback: markup drift must not blind us twice (cf. splash.js). The
  // cheap body-text gate keeps this off the hot path — "paused" is absent mid-solve.
  if (!PAUSE_TEXT.test(document.body?.textContent ?? '')) return null;
  for (const el of document.body.querySelectorAll('*')) {
    // Only rendered copy anchors — the phrase can also live in server-rendered JSON.
    if (/^(script|style|noscript|template)$/i.test(el.tagName)) continue;
    if (!PAUSE_TEXT.test(el.textContent ?? '')) continue;
    if ([...el.children].some((child) => PAUSE_TEXT.test(child.textContent ?? ''))) continue;
    if (!visible(el)) continue;
    let node = el;
    for (let hops = 0; node && node !== document.body && hops < 6; hops++, node = node.parentElement) {
      const btn = resumeButtonIn(node);
      if (btn) return btn;
    }
  }
  return null;
}

/** True while the NYT pause veil is up (REQ-LIFE-017); false on a page without one. */
export function isPaused(document) {
  return findResumeButton(document) != null;
}

/**
 * Resume a paused puzzle by clicking its Resume button, like a user would. Idempotent:
 * with no veil up it does nothing.
 * @returns {boolean} true when a paused overlay was found and clicked.
 */
export function resumePuzzle(document) {
  const btn = findResumeButton(document);
  if (!btn) return false;
  clickCell(btn); // full mousedown/mouseup/click, like every other page write
  return true;
}

/**
 * Click Resume (when present) and wait for the veil to clear — the standalone flow for
 * callers that want to confirm the board is live again.
 * @returns {Promise<boolean>} true when no pause veil remains (or none existed).
 */
export async function dismissPause(document, { waitMs = 2000, pollMs = 100 } = {}) {
  if (!resumePuzzle(document)) return true;
  const deadline = Date.now() + waitMs;
  while (Date.now() < deadline) {
    if (!isPaused(document)) return true;
    await settle(pollMs);
  }
  return false;
}
