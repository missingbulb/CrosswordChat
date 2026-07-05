// Options page logic: reading speed (REQ-SPCH-001) and the default next-clue strategy
// (REQ-NAV-012). Changes save immediately — the standard options_ui page has no OK button.

import {
  loadSettings, saveSettings, RATE_MIN, RATE_MAX,
} from '../settings/settings.js';

async function init() {
  const settings = await loadSettings();

  // Speed slider: the label tracks the drag live, but storage writes only on release —
  // chrome.storage.sync write quotas are per-minute and a drag fires dozens of events.
  const slider = document.querySelector('#rate');
  const readout = document.querySelector('#rate-value');
  Object.assign(slider, { min: RATE_MIN, max: RATE_MAX, step: 0.1, value: settings.rate });
  const showRate = () => { readout.value = `${Number(slider.value).toFixed(1)}×`; };
  showRate();
  slider.addEventListener('input', showRate);
  slider.addEventListener('change', () => {
    settings.rate = Number(slider.value);
    void saveSettings(settings);
  });

  for (const input of document.querySelectorAll('input[name="strategy"]')) {
    input.checked = input.value === settings.strategy;
    input.addEventListener('change', () => {
      if (!input.checked) return;
      settings.strategy = input.value;
      void saveSettings(settings); // the whole object — a partial save would reset the rate
    });
  }
}

void init();
