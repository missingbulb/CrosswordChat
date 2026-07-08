// REQ-LIFE-012 — the CrosswordChat mark in its ACTIVE livery (ink tile, gold
// bubble): while a session runs the tile inverts so "on" is unmistakable at a
// glance. Same shipped builder (brand-icon.js), the exact colors session-button.js
// uses for ICON_ACTIVE.

import { brandIconSvg, GOLD, INK } from '../../../extension/src/shared/brand-icon.js';
import { svgToPng } from '../render/svg-to-png.js';

export default {
  name: 'extension-button-active',
  description: 'Extension button — active (ink tile, session running)',
  req: 'REQ-LIFE-012',
  async render() {
    return svgToPng(brandIconSvg({ bg: INK, ink: INK, bubble: GOLD, size: 128 }), { width: 128 });
  },
};
