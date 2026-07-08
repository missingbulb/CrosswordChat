// REQ-CMD-007 — the Voice-commands reference page (help.html), opened in a new tab
// from the action-icon menu or the in-page dropdown. A full static page (CSS grid,
// custom properties, an emoji) — rendered by headless Chromium, the only engine that
// draws it faithfully.

import { pageToPng } from '../render/page-to-png.js';

export default {
  name: 'help-page',
  description: 'Voice-commands help page (help.html)',
  req: 'REQ-CMD-007',
  engine: 'browser', // headless Chromium — self-skips where one isn't present
  maxDiffRatio: 0.02, // browser screenshot: small cross-env antialiasing tolerance
  async render() {
    return pageToPng('extension/src/help/help.html', { width: 820, fullPage: true });
  },
};
