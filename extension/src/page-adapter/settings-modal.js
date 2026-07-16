// The in-page Settings dialog (REQ-NAV-012). Opened from the toolbar split button's
// Settings item, it mirrors the NYT crossword's own "Puzzle Settings" modal — a card
// centred over a dimming overlay, a Karnak title, sectioned rows, and a primary /
// secondary button pair — so reaching CrosswordChat's settings feels like reaching
// NYT's. The extension icon's own Settings route is unchanged (it still pops the
// options page); only this in-page path is a centred modal.
//
// The content is CrosswordChat's (reading speed + the default "next" strategy), not
// NYT's; only the LOOK is borrowed. We inherit NYT's already-loaded webfonts by
// naming them (`karnak`, `nyt-franklin`) with generic fallbacks, so the dialog matches
// on the live page and still renders legibly wherever those fonts are absent (tests,
// the golden). Edits are buffered in a draft and nothing persists until Save — the same
// contract as the options page (options.js) — so this module never touches storage
// itself; it borrows the settings module's loadSettings/saveSettings (REQ-NFR-002).

import {
  loadSettings, saveSettings, DEFAULT_SETTINGS, RATE_MIN, RATE_MAX,
} from '../settings/settings.js';
import { BIASING_CHOICES, BIASING_NOTE, DEFAULT_BIASING } from '../shared/biasing-modes.js';

export const MODAL_ID = 'cc-settings-modal';

// Minimal HTML-escape for the biasing labels/hints injected into the markup below (our own
// constants, but they carry `&`/`—`, so escape defensively).
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Scoped under #cc-settings-modal so nothing leaks into the host page. Fonts name NYT's
// families first (already loaded on the puzzle page) and fall back to generics.
export const SETTINGS_MODAL_CSS = `
#${MODAL_ID} {
  position: fixed; inset: 0; z-index: 2147483647;
  display: flex; align-items: center; justify-content: center;
  font-family: nyt-franklin, "Libre Franklin", "Franklin Gothic", system-ui, -apple-system, sans-serif;
  color: #121212; line-height: 1.4;
}
#${MODAL_ID} * { box-sizing: border-box; }
#${MODAL_ID} .cc-overlay {
  position: absolute; inset: 0; background: rgba(0, 0, 0, 0.5);
}
#${MODAL_ID} .cc-body {
  position: relative; background: #fff; border-radius: 3px;
  width: min(92vw, 580px); max-height: 90vh; overflow-y: auto;
  padding: 28px 32px 24px; box-shadow: 0 8px 28px rgba(0, 0, 0, 0.28);
  outline: none;
}
#${MODAL_ID} .cc-close {
  position: absolute; top: 12px; right: 12px;
  width: 32px; height: 32px; border: 0; background: transparent;
  font-size: 20px; line-height: 1; color: #757575; cursor: pointer; border-radius: 50%;
}
#${MODAL_ID} .cc-close:hover { background: #f0f0f0; color: #121212; }
#${MODAL_ID} .cc-title-wrap { text-align: left; margin: 0 0 20px; }
#${MODAL_ID} .cc-title {
  font-family: karnak, "nyt-karnak", Georgia, "Times New Roman", serif;
  font-size: 30px; font-weight: 700; margin: 0;
}
#${MODAL_ID} .cc-section { border-top: 1px solid #e6e6e6; padding: 16px 0 4px; }
#${MODAL_ID} .cc-section:first-of-type { border-top: 0; padding-top: 0; }
#${MODAL_ID} .cc-heading { font-size: 15px; font-weight: 700; margin: 0 0 10px; }
#${MODAL_ID} .cc-inset { padding-left: 4px; }
#${MODAL_ID} .cc-inset label {
  display: flex; align-items: baseline; gap: 8px; margin: 8px 0; cursor: pointer;
}
#${MODAL_ID} .cc-inset input[type="radio"] { margin: 0; }
#${MODAL_ID} .cc-rate { width: 100%; margin: 4px 0 6px; }
#${MODAL_ID} .cc-rate-value { font-weight: 700; font-variant-numeric: tabular-nums; }
#${MODAL_ID} .cc-hint { margin: 2px 0 8px; font-size: 13px; color: #666; }
#${MODAL_ID} .cc-hint.cc-indent { padding-left: 24px; }
#${MODAL_ID} .cc-btns {
  display: flex; justify-content: space-between; gap: 16px;
  margin-top: 22px; padding-top: 20px; border-top: 1px solid #e6e6e6;
}
#${MODAL_ID} .cc-btn {
  font: inherit; font-weight: 700; border-radius: 40px;
  padding: 11px 26px; cursor: pointer; min-width: 150px;
}
#${MODAL_ID} .cc-primary { background: #121212; border: 1px solid #121212; color: #fff; }
#${MODAL_ID} .cc-primary:hover { background: #333; }
#${MODAL_ID} .cc-secondary { background: #fff; border: 1px solid #121212; color: #121212; }
#${MODAL_ID} .cc-secondary:hover { background: #f3f3f3; }
#${MODAL_ID} .cc-secondary[disabled] { opacity: 0.35; cursor: default; }
`;

// The dialog markup in its fresh-install default state (list-order, 1.3×, commands biasing) —
// the state the golden captures and the state mount() starts from before loadSettings resolves.
export function settingsModalMarkup() {
  return `
<div id="${MODAL_ID}" role="dialog" aria-modal="true" aria-label="CrosswordChat settings">
  <div class="cc-overlay" data-cc-role="overlay"></div>
  <div class="cc-body" tabindex="-1" data-cc-role="body">
    <button type="button" class="cc-close" data-cc-role="close" aria-label="close">✕</button>
    <div class="cc-title-wrap"><h1 class="cc-title">CrosswordChat Settings</h1></div>
    <form class="cc-form" data-cc-role="form">
      <section class="cc-section">
        <header class="cc-heading">Reading speed</header>
        <div class="cc-inset">
          <label for="cc-rate">Read clues and prompts at
            <output class="cc-rate-value" data-cc-role="rate-value">1.3×</output></label>
          <input type="range" id="cc-rate" class="cc-rate" data-cc-role="rate"
                 min="${RATE_MIN}" max="${RATE_MAX}" step="0.1" value="1.3">
        </div>
      </section>
      <section class="cc-section">
        <header class="cc-heading">Where &ldquo;next&rdquo; goes</header>
        <div class="cc-inset">
          <label><input type="radio" name="cc-strategy" value="list-order" checked>
            <span>In list order</span></label>
          <p class="cc-hint cc-indent">6 -&gt; 7, 7 -&gt; 8, you get it...</p>
          <label><input type="radio" name="cc-strategy" value="most-filled">
            <span>Smart Next</span></label>
          <p class="cc-hint cc-indent">We guess what you'd solve next. The clue you've already
            filled in the most.</p>
        </div>
      </section>
      <section class="cc-section">
        <header class="cc-heading">Experimental: speech biasing</header>
        <div class="cc-inset">
          ${BIASING_NOTE ? `<p class="cc-hint">${esc(BIASING_NOTE)}</p>` : ''}${BIASING_CHOICES.map(({ value, label, hint }) => `
          <label><input type="radio" name="cc-biasing" value="${value}"${value === DEFAULT_BIASING ? ' checked' : ''}>
            <span>${esc(label)}</span></label>${hint ? `
          <p class="cc-hint cc-indent">${esc(hint)}</p>` : ''}`).join('')}
        </div>
      </section>
      <section class="cc-section">
        <header class="cc-heading">Hearing you over its own voice</header>
        <div class="cc-inset">
          <label><input type="radio" name="cc-echo" value="guard" checked>
            <span>Filter out its own voice</span></label>
          <p class="cc-hint cc-indent">Best on speakers: it ignores the words it just spoke, so
            they&rsquo;re never mistaken for your answer.</p>
          <label><input type="radio" name="cc-echo" value="native">
            <span>Trust your device&rsquo;s echo cancellation</span></label>
          <p class="cc-hint cc-indent">Best with headphones: skip that filter for snappier
            interruptions. On speakers it may sometimes mishear its own voice.</p>
        </div>
      </section>
    </form>
    <div class="cc-btns">
      <button type="button" class="cc-btn cc-secondary" data-cc-role="reset"
              disabled aria-disabled="true">Restore defaults</button>
      <button type="button" class="cc-btn cc-primary" data-cc-role="save">Save and close</button>
    </div>
  </div>
</div>`;
}

const atDefaults = (draft) =>
  draft.strategy === DEFAULT_SETTINGS.strategy && draft.rate === DEFAULT_SETTINGS.rate
  && draft.echoMode === DEFAULT_SETTINGS.echoMode
  && draft.biasing === DEFAULT_SETTINGS.biasing;

/**
 * Mount the Settings dialog into the page (one at a time). Loads the persisted settings,
 * buffers edits in a draft, and only writes on Save. Close (the ✕, the overlay, or
 * Escape) discards unsaved edits.
 * @param {Document} document
 * @param {{onClose?: () => void}} [handlers]
 * @returns {{close: () => void}}
 */
export function mountSettingsModal(document, { onClose } = {}) {
  const existing = document.getElementById(MODAL_ID);
  if (existing) {
    existing.querySelector('[data-cc-role="body"]')?.focus();
    return { close() { existing.remove(); } };
  }

  const view = document.defaultView ?? globalThis;
  const root = document.createElement('div');
  const style = document.createElement('style');
  style.textContent = SETTINGS_MODAL_CSS;
  root.innerHTML = settingsModalMarkup();
  // The markup's outer node carries the id; hoist its children under a wrapper we own so
  // the injected <style> and the dialog live together and remove() takes both.
  const dialog = root.firstElementChild;
  root.remove?.();

  const host = document.createElement('div');
  host.dataset.ccRole = 'settings-host';
  host.append(style, dialog);
  document.body.appendChild(host);

  const $ = (sel) => dialog.querySelector(sel);
  const body = $('[data-cc-role="body"]');
  const slider = $('[data-cc-role="rate"]');
  const readout = $('[data-cc-role="rate-value"]');
  const resetBtn = $('[data-cc-role="reset"]');
  const radios = [...dialog.querySelectorAll('input[name="cc-strategy"]')];
  const echoRadios = [...dialog.querySelectorAll('input[name="cc-echo"]')];
  const biasingRadios = [...dialog.querySelectorAll('input[name="cc-biasing"]')];

  let draft = { ...DEFAULT_SETTINGS };
  let removed = false;

  const render = () => {
    slider.value = draft.rate;
    readout.value = `${Number(slider.value).toFixed(1)}×`;
    for (const input of radios) input.checked = input.value === draft.strategy;
    for (const input of echoRadios) input.checked = input.value === draft.echoMode;
    for (const input of biasingRadios) input.checked = input.value === draft.biasing;
    resetBtn.disabled = atDefaults(draft);
    resetBtn.setAttribute('aria-disabled', String(resetBtn.disabled));
  };

  const close = () => {
    if (removed) return;
    removed = true;
    view.document.removeEventListener('keydown', onKeydown, true);
    host.remove();
    onClose?.();
  };

  function onKeydown(event) {
    if (event.key !== 'Escape') return;
    event.stopPropagation();
    event.preventDefault();
    close();
  }

  slider.addEventListener('input', () => {
    draft.rate = Number(slider.value);
    readout.value = `${draft.rate.toFixed(1)}×`;
    resetBtn.disabled = atDefaults(draft);
    resetBtn.setAttribute('aria-disabled', String(resetBtn.disabled));
  });
  for (const input of radios) {
    input.addEventListener('change', () => {
      if (input.checked) draft.strategy = input.value;
      resetBtn.disabled = atDefaults(draft);
      resetBtn.setAttribute('aria-disabled', String(resetBtn.disabled));
    });
  }
  for (const input of echoRadios) {
    input.addEventListener('change', () => {
      if (input.checked) draft.echoMode = input.value;
      resetBtn.disabled = atDefaults(draft);
      resetBtn.setAttribute('aria-disabled', String(resetBtn.disabled));
    });
  }
  for (const input of biasingRadios) {
    input.addEventListener('change', () => {
      if (input.checked) draft.biasing = input.value;
      resetBtn.disabled = atDefaults(draft);
      resetBtn.setAttribute('aria-disabled', String(resetBtn.disabled));
    });
  }
  resetBtn.addEventListener('click', () => {
    draft = { ...DEFAULT_SETTINGS };
    render();
  });
  $('[data-cc-role="save"]').addEventListener('click', async () => {
    await saveSettings(draft); // the whole object — a partial save would reset the other field
    close();
  });
  $('[data-cc-role="close"]').addEventListener('click', close);
  $('[data-cc-role="overlay"]').addEventListener('click', close);
  view.document.addEventListener('keydown', onKeydown, true);

  // Show defaults immediately, then reconcile once storage answers (unless closed first).
  render();
  body.focus();
  void loadSettings().then((saved) => {
    if (removed) return;
    draft = { ...saved };
    render();
  });

  return { close };
}
