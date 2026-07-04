// Options page logic (REQ-NAV-012): pick the default next-clue strategy.
// Changes save immediately — the standard options_ui page has no OK button.

import { loadSettings, saveSettings } from '../settings/settings.js';

async function init() {
  const { strategy } = await loadSettings();
  for (const input of document.querySelectorAll('input[name="strategy"]')) {
    input.checked = input.value === strategy;
    input.addEventListener('change', () => {
      if (input.checked) void saveSettings({ strategy: input.value });
    });
  }
}

void init();
