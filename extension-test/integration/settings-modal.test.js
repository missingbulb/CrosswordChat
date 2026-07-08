// @vitest-environment jsdom
// The in-page Settings modal (REQ-NAV-012): opened from the toolbar dropdown's Settings
// item, it mirrors NYT's Puzzle Settings popup but carries CrosswordChat's settings.
// Edits buffer in a draft and only persist on Save; the ✕, the overlay, and Escape
// discard. The extension-icon Settings route (options.html) is a separate surface and
// is unaffected.

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { mountSettingsModal, MODAL_ID } from '../../extension/src/page-adapter/settings-modal.js';
import { DEFAULT_SETTINGS } from '../../extension/src/settings/settings.js';

function fakeChromeStorage(initial = {}) {
  const store = { ...initial };
  globalThis.chrome = {
    storage: {
      sync: {
        get: async (defaults) => ({ ...defaults, ...store }),
        set: async (values) => Object.assign(store, values),
      },
    },
  };
  return store;
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

const modal = () => document.getElementById(MODAL_ID);
const q = (sel) => modal()?.querySelector(sel);
const strategy = (value) => modal()?.querySelector(`input[name="cc-strategy"][value="${value}"]`);

beforeEach(() => {
  document.body.innerHTML = '';
});
afterEach(() => {
  delete globalThis.chrome;
});

describe('in-page Settings modal (REQ-NAV-012)', () => {
  test('mounts a centred dialog with the NYT-styled title and button pair', () => {
    fakeChromeStorage();
    mountSettingsModal(document);

    const dialog = modal();
    expect(dialog).toBeTruthy();
    expect(dialog.getAttribute('role')).toBe('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(q('.cc-overlay')).toBeTruthy();
    expect(q('.cc-title').textContent).toContain('CrosswordChat');
    expect(q('[data-cc-role="save"]').textContent).toBe('Save and close');
    expect(q('[data-cc-role="reset"]').textContent).toBe('Restore defaults');
  });

  test('reflects the persisted settings once storage answers', async () => {
    fakeChromeStorage({ strategy: 'most-filled', rate: 1.7 });
    mountSettingsModal(document);
    await flush();

    expect(strategy('most-filled').checked).toBe(true);
    expect(q('[data-cc-role="rate"]').value).toBe('1.7');
    expect(q('[data-cc-role="rate-value"]').value).toBe('1.7×');
    // Non-default settings → Restore defaults is offered.
    expect(q('[data-cc-role="reset"]').disabled).toBe(false);
  });

  test('Save persists the edited draft and closes; nothing wrote before Save', async () => {
    const store = fakeChromeStorage();
    mountSettingsModal(document);
    await flush();

    strategy('most-filled').checked = true;
    strategy('most-filled').dispatchEvent(new Event('change'));
    expect(store.strategy).toBeUndefined(); // buffered — not yet written

    q('[data-cc-role="save"]').click();
    await flush();

    expect(store.strategy).toBe('most-filled');
    expect(modal()).toBeNull(); // Save closes the dialog
  });

  test('Restore defaults refills the form (unsaved) and disables itself', async () => {
    fakeChromeStorage({ strategy: 'most-filled', rate: 1.7 });
    const spySet = vi.spyOn(globalThis.chrome.storage.sync, 'set');
    mountSettingsModal(document);
    await flush();

    q('[data-cc-role="reset"]').click();

    expect(strategy(DEFAULT_SETTINGS.strategy).checked).toBe(true);
    expect(q('[data-cc-role="rate"]').value).toBe(String(DEFAULT_SETTINGS.rate));
    expect(q('[data-cc-role="reset"]').disabled).toBe(true); // now at defaults
    expect(spySet).not.toHaveBeenCalled(); // Reset does not persist — only Save does
  });

  test('the ✕, the overlay, and Escape each close without saving', async () => {
    for (const closeIt of [
      () => q('[data-cc-role="close"]').click(),
      () => q('[data-cc-role="overlay"]').click(),
      () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })),
    ]) {
      const store = fakeChromeStorage();
      mountSettingsModal(document);
      await flush();
      strategy('most-filled').checked = true;
      strategy('most-filled').dispatchEvent(new Event('change'));

      closeIt();

      expect(modal()).toBeNull();
      expect(store.strategy).toBeUndefined(); // discarded, not written
    }
  });

  test('a second open does not stack a duplicate dialog', async () => {
    fakeChromeStorage();
    mountSettingsModal(document);
    await flush();
    mountSettingsModal(document);
    await flush();

    expect(document.querySelectorAll(`#${MODAL_ID}`).length).toBe(1);
  });
});
