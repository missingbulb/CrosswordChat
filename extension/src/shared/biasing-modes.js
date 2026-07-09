// The experimental STT contextual-biasing modes (REQ-SPCH-011) — the single source of truth
// shared by the settings module, both settings UIs, and the biasing phrase-builder. Data only;
// no browser APIs. Ids are FROZEN (persisted in chrome.storage via REQ-NAV-012): renaming one
// silently resets every user's stored choice.

export const BIASING_MODES = ['off', 'commands', 'spelling', 'full'];
// The default is an actual experiment (commands) — "off" is a deliberate opt-out the user
// selects, not the default. Biasing only does anything on Chrome's on-device path, so this is
// inert for cloud-path users regardless (REQ-SPCH-011).
export const DEFAULT_BIASING = 'commands';

// One line the settings UIs show above the group: biasing only does anything on Chrome's
// on-device recognition path, so on the default cloud path these are inert (REQ-SPCH-011).
export const BIASING_NOTE = 'Requires Chrome’s on-device recognition (Chrome 139+). '
  + 'On the standard cloud path these have no effect.';

// value → { label, hint } for the radio group. Kept next to the ids so the two never drift.
export const BIASING_CHOICES = [
  { value: 'off', label: 'No biasing experiments',
    hint: 'Turn the experiments off — recognition runs exactly as it does today.' },
  { value: 'commands', label: 'Experimental 1 — Commands & clue labels',
    hint: 'Default. Nudges recognition toward voice commands and this puzzle’s clue numbers (“12 across”).' },
  { value: 'spelling', label: 'Experimental 2 — Letters & spelling',
    hint: 'Nudges toward single letters and the NATO alphabet when spelling or entering 1–2 letters.' },
  { value: 'full', label: 'Experimental 3 — Full adaptive',
    hint: 'Both of the above, switched to match what you’re doing (answering, navigating, spelling).' },
];
