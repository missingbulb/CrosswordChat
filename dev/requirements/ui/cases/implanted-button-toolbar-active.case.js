// REQ-LIFE-012 — the injected session button in the real NYT toolbar while a
// session runs: the tile inverts (ink tile, gold bubble) so "on" is unmistakable
// in place. Same shipped injector, driven to its active state via the handle.

import { renderToolbar } from '../render/toolbar.js';

export default {
  name: 'implanted-button-toolbar-active',
  description: 'Injected session button in the NYT toolbar — active (session running)',
  req: 'REQ-LIFE-012',
  async render() {
    return renderToolbar({ active: true });
  },
};
