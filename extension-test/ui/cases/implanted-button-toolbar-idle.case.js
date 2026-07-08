// REQ-LIFE-012 — the session button injected into the real NYT toolbar, idle: the
// shipped mountSessionButton places our gold mark right after the pencil tool. The
// toolbar structure is the captured live sample; the button is injected by the real
// code, so this golden proves the placement, not just the art.

import { renderToolbar } from '../render/toolbar.js';

export default {
  name: 'implanted-button-toolbar-idle',
  description: 'Injected session button in the NYT toolbar — idle',
  req: 'REQ-LIFE-012',
  async render() {
    return renderToolbar({ active: false });
  },
};
