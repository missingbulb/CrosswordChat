// REQ-NAV-012 — the in-page Settings modal opened from the toolbar split button. It
// mirrors NYT's own Puzzle Settings popup (a card centred on a dimming overlay, a Karnak
// title, sectioned rows, a primary/secondary button pair) while carrying CrosswordChat's
// own settings. The golden composes the SHIPPED module's CSS + default-state markup, so
// it tracks the real dialog; native form widgets (a range slider, radio buttons) and the
// fallback fonts (NYT's karnak/franklin aren't loaded here) are drawn by headless Chromium.

import { contentToPng } from '../render/page-to-png.js';
import { SETTINGS_MODAL_CSS, settingsModalMarkup } from '../../../../extension/src/page-adapter/settings-modal.js';

export default {
  name: 'settings-modal',
  description: 'In-page Settings modal (NYT-styled) — default state',
  req: 'REQ-NAV-012',
  engine: 'browser', // headless Chromium — self-skips where one isn't present
  maxDiffRatio: 0.02, // browser screenshot: small cross-env antialiasing tolerance
  async render() {
    return contentToPng(`<style>${SETTINGS_MODAL_CSS}</style>${settingsModalMarkup()}`, {
      width: 680, height: 920, // tall enough to show the whole card (rate + strategy + biasing + echo + buttons)
    });
  },
};
