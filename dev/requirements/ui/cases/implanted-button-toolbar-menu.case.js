// REQ-CMD-007 — the injected split button's dropdown open: the caret reveals the
// menu the shipped code builds — Activate, Settings, Voice commands. Driven through
// the real open path (a caret click), so the golden proves the menu's contents and
// placement, not a hand-built copy.

import { renderToolbar } from '../render/toolbar.js';

export default {
  name: 'implanted-button-toolbar-menu',
  description: 'Injected split button with its dropdown open (Activate / Settings / Voice commands)',
  req: 'REQ-CMD-007',
  async render() {
    return renderToolbar({ active: false, menuOpen: true });
  },
};
