// Message vocabulary shared by panel ⇄ content ⇄ background. Data only.

export const MSG = {
  // panel → content (request/response)
  PING: 'cc:ping',
  SNAPSHOT: 'cc:snapshot',
  ENTER: 'cc:enter',
  SELECT: 'cc:select',
  CLEAR: 'cc:clear',
  PROBE: 'cc:probe',
  WATCH: 'cc:watch',
  UNWATCH: 'cc:unwatch',
  // content → panel (broadcast)
  PAGE_EVENT: 'cc:page-event',
  // panel ⇄ background port
  PANEL_PORT: 'cc-panel',
  HELLO: 'cc:hello',
  TAB: 'cc:tab',
  CLOSE: 'cc:close',
};
