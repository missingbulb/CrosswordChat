// In-page session control (REQ-LIFE-012): a split button placed at the right end of NYT's
// puzzle toolbar — so starting a conversation is discoverable where the solving happens (the
// extension icon remains an equivalent control). The main half toggles the session (start
// when idle, stop mid-session); a small caret opens a menu with Activate, Settings, and Voice
// commands (help) — REQ-CMD-007. This is the ONE load-time page change the extension makes
// (REQ-NFR-004's carve-out). The NYT app renders after the content script loads (and can sit
// behind the pre-puzzle splash for minutes), so mounting waits with a MutationObserver that
// disconnects the moment the button lands. The give-up timer only fires on pages that show no
// crossword app markup at all (archive pages, section fronts): no button, no errors, the icon
// still works. While app markup IS present, it keeps waiting — a slow render or splash must
// not cost the button. The button lives only in the toolbar: no toolbar, no on-page button.

import { SEL, CC_BUTTON_ID } from './selectors.js';
import { brandIconSvg, GOLD, INK } from '../shared/brand-icon.js';

export const BUTTON_ID = CC_BUTTON_ID;

const LABEL_START = 'CrosswordChat — start voice session';
const LABEL_STOP = 'CrosswordChat — stop voice session';
const LABEL_MENU = 'CrosswordChat menu';

// The button wears the extension's own mark at toolbar size, so what the user installed
// is what they find on the page. While a session runs the tile inverts — ink tile, gold
// bubble — so "on" is unmistakable at a glance.
const ICON_IDLE = brandIconSvg({ bg: GOLD, ink: INK, bubble: '#FFFFFF', size: 26 });
const ICON_ACTIVE = brandIconSvg({ bg: INK, ink: INK, bubble: GOLD, size: 26 });

// The dropdown entries (REQ-CMD-007). "activate" is state-labelled (Activate/Deactivate);
// the other two open extension pages via the caller's handlers.
const STATIC_ITEMS = [
  { act: 'settings', label: 'Settings' },
  { act: 'help', label: 'Voice commands' },
];

// The toolbar's tool row — the button appends here as its last child, so it always lands at
// the right end. Returns null when no toolbar is present yet (the page hasn't rendered one,
// or has none at all — an archive page).
function findToolRow(document) {
  const toolbar = document.querySelector(SEL.toolbar);
  if (!toolbar) return null;
  return toolbar.querySelector('ul') ?? toolbar;
}

/**
 * Inject the split session button (now, or as soon as the toolbar renders).
 * @param {Document} document
 * @param {{onToggle: () => void, onSettings?: () => void, onHelp?: () => void}} handlers
 *   onToggle — main click / Activate item (caller decides start vs stop);
 *   onSettings / onHelp — the dropdown items.
 * @param {{waitMs?: number}} [opts]  waitMs — give-up re-check interval for non-app pages.
 * @returns {{setActive(on: boolean): void, remove(): void}}
 */
export function mountSessionButton(document, handlers, { waitMs = 30_000 } = {}) {
  const { onToggle, onSettings, onHelp } = handlers ?? {};
  const view = document.defaultView ?? globalThis;
  let wrapper = null; // the #CC_BUTTON_ID container (placement + dedupe + remove)
  let mainBtn = null; // the toggle half (icon + session state)
  let caretBtn = null; // opens/closes the menu
  let menu = null; // the dropdown
  let activateItem = null; // state-labelled first item
  let active = false;
  let menuOpen = false;
  let observer = null;
  let giveUp = null;
  let onDocPointer = null; // outside-click / Escape closers, live only while the menu is open

  const settle = () => {
    observer?.disconnect();
    observer = null;
    if (giveUp != null) view.clearTimeout(giveUp);
    giveUp = null;
  };

  const apply = () => {
    if (!mainBtn) return;
    const label = active ? LABEL_STOP : LABEL_START;
    mainBtn.setAttribute('aria-pressed', String(active));
    mainBtn.setAttribute('aria-label', label);
    mainBtn.title = label;
    mainBtn.innerHTML = active ? ICON_ACTIVE : ICON_IDLE;
    if (activateItem) activateItem.textContent = active ? 'Stop session' : 'Activate';
  };

  const closeMenu = () => {
    menuOpen = false;
    if (menu) menu.hidden = true;
    caretBtn?.setAttribute('aria-expanded', 'false');
    if (onDocPointer) {
      view.document.removeEventListener('click', onDocPointer, true);
      view.document.removeEventListener('keydown', onDocPointer, true);
      onDocPointer = null;
    }
  };

  const openMenu = () => {
    if (!menu) return;
    menuOpen = true;
    menu.hidden = false;
    caretBtn?.setAttribute('aria-expanded', 'true');
    // Any click outside the button, or Escape, dismisses the menu. Capture phase so a
    // click that also lands on the page never leaves the menu stuck open.
    onDocPointer = (event) => {
      if (event.type === 'keydown' && event.key !== 'Escape') return;
      if (event.type === 'click' && wrapper?.contains(event.target)) return;
      closeMenu();
    };
    view.document.addEventListener('click', onDocPointer, true);
    view.document.addEventListener('keydown', onDocPointer, true);
  };

  // A menu row. Stops propagation so the host page never reacts to our own clicks.
  const makeItem = (label, run) => {
    const item = document.createElement('button');
    item.type = 'button';
    item.setAttribute('role', 'menuitem');
    item.dataset.ccRole = 'menu-item';
    item.textContent = label;
    item.style.cssText = 'display:block;width:100%;text-align:left;padding:7px 12px;'
      + 'background:transparent;border:0;font:inherit;color:#191919;cursor:pointer;white-space:nowrap;';
    item.addEventListener('mouseenter', () => { item.style.background = '#f3f3f3'; });
    item.addEventListener('mouseleave', () => { item.style.background = 'transparent'; });
    item.addEventListener('click', (event) => {
      event.stopPropagation();
      event.preventDefault();
      closeMenu();
      run?.();
    });
    return item;
  };

  // Build the whole split button: a main half wearing the mark, a caret, and the menu that
  // drops below it. Every paint is inline, and the SVG is hostile-host-hardened (brand-icon).
  const build = () => {
    wrapper = document.createElement('span');
    wrapper.id = BUTTON_ID;
    wrapper.style.cssText = 'position:relative;display:inline-flex;align-items:center;';

    mainBtn = document.createElement('button');
    mainBtn.type = 'button';
    mainBtn.dataset.ccRole = 'main';
    mainBtn.style.cssText = 'background:transparent;border:0;cursor:pointer;display:inline-flex;align-items:center;';
    mainBtn.addEventListener('click', () => onToggle?.());

    caretBtn = document.createElement('button');
    caretBtn.type = 'button';
    caretBtn.dataset.ccRole = 'caret';
    caretBtn.setAttribute('aria-haspopup', 'menu');
    caretBtn.setAttribute('aria-expanded', 'false');
    caretBtn.setAttribute('aria-label', LABEL_MENU);
    caretBtn.title = LABEL_MENU;
    caretBtn.textContent = '▾';
    caretBtn.style.cssText = 'background:transparent;border:0;cursor:pointer;display:inline-flex;'
      + 'align-items:center;justify-content:center;font-size:12px;line-height:1;color:inherit;'
      + 'padding:0 4px;align-self:stretch;';
    caretBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      event.preventDefault();
      if (menuOpen) closeMenu(); else openMenu();
    });

    menu = document.createElement('div');
    menu.setAttribute('role', 'menu');
    menu.dataset.ccRole = 'menu';
    menu.hidden = true;
    menu.style.cssText = 'position:absolute;right:0;top:100%;margin-top:4px;min-width:150px;'
      + 'background:#fff;color:#191919;border:1px solid #d6d6d6;border-radius:8px;'
      + 'box-shadow:0 4px 14px rgba(0,0,0,.18);padding:4px 0;z-index:2147483647;'
      + 'font:13px/1.4 system-ui,sans-serif;';
    activateItem = makeItem('Activate', () => onToggle?.());
    activateItem.dataset.ccAct = 'activate';
    menu.append(activateItem);
    for (const { act, label } of STATIC_ITEMS) {
      const item = makeItem(label, act === 'settings' ? onSettings : onHelp);
      item.dataset.ccAct = act;
      menu.append(item);
    }

    wrapper.append(mainBtn, caretBtn, menu);
    apply();
  };

  const tryMount = () => {
    if (document.getElementById(BUTTON_ID)) return true; // already there (duplicate mount)
    const row = findToolRow(document);
    if (!row) return false;
    build();
    row.append(wrapper); // last child of the tool row → the right end of the toolbar
    return true;
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
  }

  return {
    setActive(on) {
      active = Boolean(on);
      apply();
    },
    remove() {
      settle();
      closeMenu();
      wrapper?.remove();
      wrapper = mainBtn = caretBtn = menu = activateItem = null;
    },
  };
}
