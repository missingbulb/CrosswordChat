// The experimental STT contextual-biasing modes (REQ-SPCH-011) — the single source of truth
// shared by the settings module, both settings UIs, and the biasing phrase-builder. Data only;
// no browser APIs. Ids are FROZEN (persisted in chrome.storage via REQ-NAV-012): renaming one
// silently resets every user's stored choice.

export const BIASING_MODES = ['off', 'commands', 'spelling', 'full'];
// The default is an actual experiment (commands) — "off" is a deliberate opt-out the user
// selects, not the default. Biasing only does anything on Chrome's on-device path, so this is
// inert for cloud-path users regardless (REQ-SPCH-011).
export const DEFAULT_BIASING = 'commands';

// Optional one-line note shown above the group ('' = no note).
export const BIASING_NOTE = '';

// value → { label, hint } for the radio group. Kept next to the ids so the two never drift.
// A '' hint renders no description line.
export const BIASING_CHOICES = [
  { value: 'off', label: 'No biasing experiments', hint: '' },
  { value: 'commands', label: 'Experiment 1 — Bias to Commands', hint: '' },
  { value: 'spelling', label: 'Experiment 2 — Bias to Letters & spelling', hint: '' },
  { value: 'full', label: 'Experiment 1 + 2', hint: '' },
];
