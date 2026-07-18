// REQ-LIFE-014 — the unsupported-site popup (unsupported.html), the action popup shown
// on tabs outside the supported URL set. Static HTML with inline-SVG NYT grid-tile logos
// and three quick-launch <a> buttons (the Mini/Midi/Crossword game pages). Rendered by
// headless Chromium (satori can't draw the SVG clipPaths/grid) at the shipped popup width;
// there is no chrome.* runtime in the popup, so there is no state to prep — fullPage so the
// whole popup shows (the real one sizes to its content).

import { pageToPng } from '../render/page-to-png.js';

export default {
  name: 'unsupported-popup',
  description: 'Unsupported-site popup (unsupported.html) — message + quick-launch buttons',
  req: 'REQ-LIFE-014',
  engine: 'browser', // headless Chromium — self-skips where one isn't present
  maxDiffRatio: 0.02, // browser screenshot: small cross-env antialiasing tolerance
  async render() {
    // Width = the shipped popup's body (280px) + its 16px padding either side. fullPage
    // captures the whole popup height (message box, the three buttons, the support line).
    return pageToPng('extension/src/popup/unsupported.html', { width: 312, height: 480, fullPage: true });
  },
};
