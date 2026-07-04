import { describe, test, expect, afterEach } from 'vitest';
import {
  DEFAULT_SETTINGS, sanitizeSettings, loadSettings, saveSettings,
} from '../../extension/src/settings/settings.js';

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

afterEach(() => {
  delete globalThis.chrome;
});

describe('persisted settings (REQ-NAV-012)', () => {
  test('REQ-NAV-012: settings round-trip through chrome.storage.sync', async () => {
    fakeChromeStorage();
    await saveSettings({ strategy: 'most-filled' });
    expect(await loadSettings()).toEqual({ strategy: 'most-filled' });
  });

  test('REQ-NAV-012: unknown stored values are sanitized to the list-order default', async () => {
    fakeChromeStorage({ strategy: 'bogus', junk: 42 });
    expect(await loadSettings()).toEqual({ strategy: 'list-order' });
    expect(sanitizeSettings({})).toEqual(DEFAULT_SETTINGS);
    expect(sanitizeSettings(null)).toEqual(DEFAULT_SETTINGS);
  });

  test('REQ-NAV-012: storage unavailable → defaults, no throw', async () => {
    expect(await loadSettings()).toEqual(DEFAULT_SETTINGS); // no chrome global at all
  });
});
