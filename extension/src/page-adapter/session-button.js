// In-page session toggle (REQ-LIFE-012): a speech-bubble button placed immediately to
// the right of NYT's pencil toggle, so starting a conversation is discoverable where the
// solving happens. This is the ONE load-time page change the extension makes
// (REQ-NFR-004's carve-out). The NYT app renders after the content script loads, so
// mounting waits for the toolbar with a bounded MutationObserver that disconnects the
// moment the button lands — or gives up quietly on pages with no pencil toggle
// (archive pages, a redesigned toolbar): no button, no errors, the icon still works.

import { SEL } from './selectors.js';

export const BUTTON_ID = 'crosswordchat-toggle';

const LABEL_START = 'CrosswordChat — start voice session';
const LABEL_STOP = 'CrosswordChat — stop voice session';
const GOLD = '#f7da21'; // crossword gold: the bubble fills with it while a session runs

// A speech bubble with three "someone is talking" dots, drawn in the toolbar's own line
// style (currentColor strokes, like the pencil next door).
const ICON_SVG = `
<svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true" focusable="false"
     fill="none" stroke="currentColor" stroke-width="1.8"
     stroke-linecap="round" stroke-linejoin="round">
  <path data-cc-bubble d="M21 15a2 2 0 0 1-2 2H8l-4 4V5a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2z"/>
  <circle cx="8.4" cy="10" r="1" fill="currentColor" stroke="none"/>
  <circle cx="12" cy="10" r="1" fill="currentColor" stroke="none"/>
  <circle cx="15.6" cy="10" r="1" fill="currentColor" stroke="none"/>
</svg>`;

/**
 * Inject the toggle button (now, or as soon as the toolbar renders).
 * @param {Document} document
 * @param {() => void} onToggle  called on every click; the caller decides start vs stop
 * @param {{waitMs?: number}} [opts]  how long to wait for a toolbar before giving up
 * @returns {{setActive(on: boolean): void, remove(): void}}
 */
export function mountSessionButton(document, onToggle, { waitMs = 30_000 } = {}) {
  const view = document.defaultView ?? globalThis;
  let button = null;
  let active = false;
  let observer = null;
  let giveUp = null;

  const settle = () => {
    observer?.disconnect();
    observer = null;
    if (giveUp != null) view.clearTimeout(giveUp);
    giveUp = null;
  };

  const apply = () => {
    if (!button) return;
    const label = active ? LABEL_STOP : LABEL_START;
    button.setAttribute('aria-pressed', String(active));
    button.setAttribute('aria-label', label);
    button.title = label;
    button.querySelector('[data-cc-bubble]')?.setAttribute('fill', active ? GOLD : 'none');
  };

  const tryMount = () => {
    if (document.getElementById(BUTTON_ID)) return true; // already there (duplicate mount)
    const pencil = document.querySelector(SEL.pencilToggle);
    if (!pencil) return false;
    button = document.createElement('button');
    button.id = BUTTON_ID;
    button.type = 'button';
    button.className = pencil.className; // borrow the toolbar's (hashed) button styling
    // Minimal own styling so the button also reads as one where no styles carry over
    // (and NYT toolbar icon buttons are transparent anyway).
    button.style.cssText = 'background:transparent;border:0;cursor:pointer;display:inline-flex;align-items:center;';
    button.innerHTML = ICON_SVG;
    button.addEventListener('click', () => onToggle());
    pencil.after(button);
    apply();
    return true;
  };

  if (!tryMount()) {
    observer = new view.MutationObserver(() => {
      if (tryMount()) settle();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    giveUp = view.setTimeout(settle, waitMs); // no toolbar here — go back to fully inert
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
