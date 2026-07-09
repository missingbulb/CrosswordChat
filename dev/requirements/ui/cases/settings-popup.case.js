// REQ-NAV-012 — the Settings popup (options.html), opened as a 380×480 popup window
// (or the action popup) from the in-page dropdown's Settings item. Native form
// widgets (a range slider, radio buttons) that satori can't draw — rendered by
// headless Chromium in its default state.

import { pageToPng } from '../render/page-to-png.js';

// The state the shipped options.js renders for a fresh install (settings.js
// DEFAULT_SETTINGS: strategy "list-order", rate 1.3×; RATE range 0.5–3, step 0.1).
// Set here because options.js is bundled at build time and needs chrome.storage.
function prep() {
  const slider = document.querySelector('#rate');
  slider.min = 0.5;
  slider.max = 3;
  slider.step = 0.1;
  slider.value = 1.3;
  document.querySelector('#rate-value').value = '1.3×';
  for (const r of document.querySelectorAll('input[name="strategy"]')) r.checked = r.value === 'list-order';
  for (const r of document.querySelectorAll('input[name="biasing"]')) r.checked = r.value === 'off';
}

export default {
  name: 'settings-popup',
  description: 'Settings popup (options.html) — default state',
  req: 'REQ-NAV-012',
  engine: 'browser', // headless Chromium — self-skips where one isn't present
  maxDiffRatio: 0.02, // browser screenshot: small cross-env antialiasing tolerance
  async render() {
    return pageToPng('extension/src/options/options.html', { width: 380, height: 920, prep }); // taller: + biasing group
  },
};
