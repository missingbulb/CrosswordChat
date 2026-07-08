// REQ-LIFE-012 — the CrosswordChat mark in its IDLE livery (gold tile, ink grid,
// white bubble): the exact art the toolbar action icon and the in-page session
// button share, straight from the shipped builder (brand-icon.js). This is the
// "start a session" appearance the user sees before a conversation begins.

import { brandIconSvg, GOLD, INK } from '../../../../extension/src/shared/brand-icon.js';
import { svgToPng } from '../render/svg-to-png.js';

export default {
  name: 'extension-button-idle',
  description: 'Extension button — idle (gold tile)',
  req: 'REQ-LIFE-012',
  async render() {
    return svgToPng(brandIconSvg({ bg: GOLD, ink: INK, bubble: '#FFFFFF', size: 128 }), { width: 128 });
  },
};
