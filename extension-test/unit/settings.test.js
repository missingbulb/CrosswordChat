import { describe, test, expect, afterEach } from 'vitest';
import {
  DEFAULT_SETTINGS, sanitizeSettings, loadSettings, saveSettings, RATE_MIN, RATE_MAX, ECHO_MODES,
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
    await saveSettings({ strategy: 'most-filled', rate: 1.7, echoMode: 'native', biasing: 'commands' });
    expect(await loadSettings()).toEqual({
      strategy: 'most-filled', rate: 1.7, echoMode: 'native', biasing: 'commands',
    });
  });

  test('REQ-NAV-012: unknown stored values are sanitized to the defaults', async () => {
    fakeChromeStorage({ strategy: 'bogus', rate: 'fast', echoMode: 'sideways', biasing: 'nope', junk: 42 });
    expect(await loadSettings()).toEqual({
      strategy: 'list-order', rate: 1.3, echoMode: 'guard', biasing: 'full',
    });
    expect(sanitizeSettings({})).toEqual(DEFAULT_SETTINGS);
    expect(sanitizeSettings(null)).toEqual(DEFAULT_SETTINGS);
  });

  test('REQ-SPCH-005: echo mode is a persisted setting, guard by default', () => {
    expect(ECHO_MODES).toEqual(['guard', 'native']);
    expect(DEFAULT_SETTINGS.echoMode).toBe('guard');
    expect(sanitizeSettings({ echoMode: 'native' }).echoMode).toBe('native');
    expect(sanitizeSettings({ echoMode: 'bogus' }).echoMode).toBe('guard'); // unknown → default
    expect(sanitizeSettings({}).echoMode).toBe('guard'); // missing → default
  });

  test('REQ-SPCH-011: the biasing mode round-trips; default is full; off is an explicit choice', async () => {
    fakeChromeStorage();
    await saveSettings({ strategy: 'list-order', rate: 1.3, biasing: 'commands' });
    expect((await loadSettings()).biasing).toBe('commands'); // a non-default value round-trips
    expect(sanitizeSettings({ biasing: 'spelling' }).biasing).toBe('spelling');
    expect(sanitizeSettings({ biasing: 'off' }).biasing).toBe('off'); // "no bias" is a real selection
    expect(sanitizeSettings({ biasing: 'bogus' }).biasing).toBe('full'); // unknown → the default
    expect(sanitizeSettings({}).biasing).toBe('full');
    expect(DEFAULT_SETTINGS.biasing).toBe('full');
  });

  test('REQ-SPCH-001: the default reading speed is 1.3×', () => {
    expect(DEFAULT_SETTINGS.rate).toBe(1.3);
  });

  test('REQ-SPCH-001: stored rates are clamped to the slider bounds and granularity', () => {
    expect(sanitizeSettings({ rate: 9 }).rate).toBe(RATE_MAX);
    expect(sanitizeSettings({ rate: 0.05 }).rate).toBe(RATE_MIN);
    expect(sanitizeSettings({ rate: 2.4499 }).rate).toBe(2.4); // slider step is 0.1
    expect(sanitizeSettings({ rate: NaN }).rate).toBe(1.3);
    expect(sanitizeSettings({ rate: Infinity }).rate).toBe(1.3);
    expect(sanitizeSettings({ rate: '1.7' }).rate).toBe(1.3); // numbers only, no coercion
  });

  test('REQ-NAV-012: storage unavailable → defaults, no throw', async () => {
    expect(await loadSettings()).toEqual(DEFAULT_SETTINGS); // no chrome global at all
  });
});
