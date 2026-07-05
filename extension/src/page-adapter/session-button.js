// In-page session toggle (REQ-LIFE-012): a speech-bubble button placed in NYT's puzzle
// toolbar — right of the pencil toggle when one can be found, at the end of the tool
// row otherwise — so starting a conversation is discoverable where the solving happens.
// This is the ONE load-time page change the extension makes (REQ-NFR-004's carve-out).
// The NYT app renders after the content script loads (and can sit behind the pre-puzzle
// splash for minutes), so mounting waits with a MutationObserver that disconnects the
// moment the button lands. The give-up timer only fires for real on pages that show no
// crossword app markup at all (archive pages, section fronts): no button, no errors,
// the icon still works. While app markup IS present, it keeps waiting — a slow render
// or splash screen must not cost the button.

import { SEL, findPencilToggle, CC_BUTTON_ID } from './selectors.js';
import { brandIconSvg, GOLD, INK } from '../shared/brand-icon.js';

export const BUTTON_ID = CC_BUTTON_ID;

const LABEL_START = 'CrosswordChat — start voice session';
const LABEL_STOP = 'CrosswordChat — stop voice session';

// The button wears the extension's own mark at toolbar size, so what the user installed
// is what they find on the page. While a session runs the tile inverts — ink tile, gold
// bubble — so "on" is unmistakable at a glance.
const ICON_IDLE = brandIconSvg({ bg: GOLD, ink: INK, bubble: '#FFFFFF', size: 26 });
const ICON_ACTIVE = brandIconSvg({ bg: INK, ink: INK, bubble: GOLD, size: 26 });

// Where to put the button: right of the pencil toggle when one is recognizable;
// otherwise right of the toolbar's last button (a redesigned toolbar without a
// findable pencil still gets the feature). Returns null when there is nothing yet.
function findAnchor(document) {
  const pencil = findPencilToggle(document);
  if (pencil) return pencil;
  const toolbar = document.querySelector(SEL.toolbar);
  const buttons = toolbar?.querySelectorAll('button, [role="button"]') ?? [];
  return buttons.length ? buttons[buttons.length - 1] : null;
}

/**
 * Inject the toggle button (now, or as soon as the toolbar renders).
 * @param {Document} document
 * @param {() => void} onToggle  called on every click; the caller decides start vs stop
 * @param {{waitMs?: number, floatAfterMs?: number}} [opts]  waitMs — give-up re-check
 *   interval for non-app pages; floatAfterMs — how long to hunt for a toolbar anchor
 *   before floating the button over the board instead (0 disables floating)
 * @returns {{setActive(on: boolean): void, remove(): void}}
 */
export function mountSessionButton(document, onToggle, { waitMs = 30_000, floatAfterMs = 10_000 } = {}) {
  const view = document.defaultView ?? globalThis;
  let button = null;
  let active = false;
  let observer = null;
  let giveUp = null;
  let floatTimer = null;

  const settle = () => {
    observer?.disconnect();
    observer = null;
    if (giveUp != null) view.clearTimeout(giveUp);
    giveUp = null;
    if (floatTimer != null) view.clearTimeout(floatTimer);
    floatTimer = null;
  };

  const apply = () => {
    if (!button) return;
    const label = active ? LABEL_STOP : LABEL_START;
    button.setAttribute('aria-pressed', String(active));
    button.setAttribute('aria-label', label);
    button.title = label;
    button.innerHTML = active ? ICON_ACTIVE : ICON_IDLE;
  };

  const tryMount = () => {
    if (document.getElementById(BUTTON_ID)) return true; // already there (duplicate mount)
    const anchor = findAnchor(document);
    if (!anchor) return false;
    button = document.createElement('button');
    button.id = BUTTON_ID;
    button.type = 'button';
    button.className = anchor.className; // borrow the toolbar's (hashed) button styling
    // Minimal own styling so the button also reads as one where no styles carry over
    // (and NYT toolbar icon buttons are transparent anyway); apply() below fills in
    // the icon for the current state.
    button.style.cssText = 'background:transparent;border:0;cursor:pointer;display:inline-flex;align-items:center;';
    button.addEventListener('click', () => onToggle());
    anchor.after(button);
    apply();
    return true;
  };

  // Last-resort placement (REQ-LIFE-012 tier 3): when a board is visibly there but no
  // toolbar anchor has turned up for floatAfterMs, float the button over the page —
  // the mark must never be simply absent on a puzzle the user can see.
  const mountFloating = () => {
    if (document.getElementById(BUTTON_ID)) return true;
    if (!document.querySelector(SEL.board)) return false;
    button = document.createElement('button');
    button.id = BUTTON_ID;
    button.type = 'button';
    button.style.cssText = 'position:fixed;right:18px;bottom:18px;z-index:2147483647;'
      + 'width:44px;height:44px;padding:5px;background:#fff;border:1px solid #c7c7c7;'
      + 'border-radius:50%;cursor:pointer;display:inline-flex;align-items:center;'
      + 'justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,.25);';
    button.addEventListener('click', () => onToggle());
    document.body.append(button);
    apply();
    return true;
  };

  const tryFloat = () => {
    floatTimer = null;
    if (mountFloating()) settle();
    else floatTimer = view.setTimeout(tryFloat, floatAfterMs); // no board yet — keep checking
  };

  // The crossword app can render (or leave the splash) minutes after us, so as long as
  // the page carries app markup this stays a patient wait; only markup-free pages make
  // it give up and go back to fully inert (REQ-NFR-004).
  const checkGiveUp = () => {
    giveUp = null;
    if (document.querySelector(SEL.app)) giveUp = view.setTimeout(checkGiveUp, waitMs);
    else settle();
  };

  if (!tryMount()) {
    observer = new view.MutationObserver(() => {
      if (tryMount()) settle();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    giveUp = view.setTimeout(checkGiveUp, waitMs);
    if (floatAfterMs > 0) floatTimer = view.setTimeout(tryFloat, floatAfterMs);
  }

  return {
    setActive(on) {
      active = Boolean(on);
      apply();
    },
    remove() {
      settle();
      button?.remove();
      button = null;
    },
  };
}
