// Settings popup logic: reading speed (REQ-SPCH-001) and the default next-clue strategy
// (REQ-NAV-012). Edits are buffered in a draft; nothing persists until Save, which writes
// the settings and closes the popup. Reset puts the defaults back in the form (still
// unsaved, so a mistaken Reset costs nothing until Save is pressed).

import {
  loadSettings, saveSettings, DEFAULT_SETTINGS, RATE_MIN, RATE_MAX,
} from '../settings/settings.js';

async function init() {
  const draft = await loadSettings();

  const slider = document.querySelector('#rate');
  const readout = document.querySelector('#rate-value');
  Object.assign(slider, { min: RATE_MIN, max: RATE_MAX, step: 0.1 });
  const radios = [...document.querySelectorAll('input[name="strategy"]')];
  const echoRadios = [...document.querySelectorAll('input[name="echoMode"]')];

  const render = () => {
    slider.value = draft.rate;
    readout.value = `${Number(slider.value).toFixed(1)}×`;
    for (const input of radios) input.checked = input.value === draft.strategy;
    for (const input of echoRadios) input.checked = input.value === draft.echoMode;
  };
  render();

  slider.addEventListener('input', () => {
    draft.rate = Number(slider.value);
    readout.value = `${draft.rate.toFixed(1)}×`;
  });
  for (const input of radios) {
    input.addEventListener('change', () => {
      if (input.checked) draft.strategy = input.value;
    });
  }
  for (const input of echoRadios) {
    input.addEventListener('change', () => {
      if (input.checked) draft.echoMode = input.value;
    });
  }

  document.querySelector('#reset').addEventListener('click', () => {
    Object.assign(draft, DEFAULT_SETTINGS);
    render();
  });

  document.querySelector('#save').addEventListener('click', async () => {
    await saveSettings(draft); // the whole object — a partial save would reset the other field
    window.close();
  });
}

void init();
