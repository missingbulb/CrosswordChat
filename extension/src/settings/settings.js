// Persisted user settings (REQ-NAV-012, REQ-SPCH-001). This module and the options page
// are the ONLY places allowed to touch chrome.storage — settings only, never audio,
// transcripts, or puzzle content (REQ-NFR-002).

import { STRATEGIES } from '../conversation/strategies.js';
import { DEFAULT_RATE } from '../speech/tts-port.js';
import { BIASING_MODES, DEFAULT_BIASING } from '../shared/biasing-modes.js';

// Reading-speed slider bounds (REQ-SPCH-001); sanitization clamps stored values to match.
export const RATE_MIN = 0.5;
export const RATE_MAX = 3;

export const DEFAULT_SETTINGS = { strategy: 'list-order', rate: DEFAULT_RATE, biasing: DEFAULT_BIASING };

function sanitizeRate(raw) {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return DEFAULT_RATE;
  // One decimal: the slider's granularity, and what the options page displays.
  return Math.min(RATE_MAX, Math.max(RATE_MIN, Math.round(raw * 10) / 10));
}

/** Whatever storage held → a settings object we trust (unknown values → defaults). */
export function sanitizeSettings(raw) {
  return {
    strategy: STRATEGIES.includes(raw?.strategy) ? raw.strategy : DEFAULT_SETTINGS.strategy,
    rate: sanitizeRate(raw?.rate),
    // REQ-SPCH-011: the experimental biasing mode; unknown values (older storage) → 'off'.
    biasing: BIASING_MODES.includes(raw?.biasing) ? raw.biasing : DEFAULT_SETTINGS.biasing,
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
