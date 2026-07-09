// Persisted user settings (REQ-NAV-012, REQ-SPCH-001). This module and the options page
// are the ONLY places allowed to touch chrome.storage — settings only, never audio,
// transcripts, or puzzle content (REQ-NFR-002).

import { STRATEGIES } from '../conversation/strategies.js';
import { DEFAULT_RATE } from '../speech/tts-port.js';

// Reading-speed slider bounds (REQ-SPCH-001); sanitization clamps stored values to match.
export const RATE_MIN = 0.5;
export const RATE_MAX = 3;

// Self-echo handling (REQ-SPCH-005): how the barge-in mic keeps our own TTS voice from
// being read as user input.
//   'guard'  — the app-level echo guard filters our spoken words back out (works on speakers,
//              where TTS acoustically reaches the mic; the default and the safe choice).
//   'native' — skip that filter and trust the browser/OS echo cancellation instead (for
//              headphones, where TTS never reaches the mic — snappier interruptions).
// Either way the formal answer mic still never opens while TTS speaks (REQ-SPCH-005(a));
// only the barge-in filter is toggled.
export const ECHO_MODES = ['guard', 'native'];

export const DEFAULT_SETTINGS = { strategy: 'list-order', rate: DEFAULT_RATE, echoMode: 'guard' };

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
    echoMode: ECHO_MODES.includes(raw?.echoMode) ? raw.echoMode : DEFAULT_SETTINGS.echoMode,
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
