// Persisted user settings (REQ-NAV-012). This module and the options page are the ONLY
// places allowed to touch chrome.storage — settings only, never audio, transcripts, or
// puzzle content (REQ-NFR-002).

import { STRATEGIES } from '../conversation/strategies.js';

export const DEFAULT_SETTINGS = { strategy: 'list-order' };

/** Whatever storage held → a settings object we trust (unknown values → defaults). */
export function sanitizeSettings(raw) {
  return {
    strategy: STRATEGIES.includes(raw?.strategy) ? raw.strategy : DEFAULT_SETTINGS.strategy,
  };
}

export async function loadSettings() {
  try {
    return sanitizeSettings(await chrome.storage.sync.get(DEFAULT_SETTINGS));
  } catch {
    return { ...DEFAULT_SETTINGS }; // storage unavailable — behave like a fresh install
  }
}

export async function saveSettings(settings) {
  await chrome.storage.sync.set(sanitizeSettings(settings));
}
