// Service worker: the "switchboard". Icon toggle (REQ-LIFE-001/002), one session at
// a time (REQ-LIFE-009), badge feedback for pages we can't work on (REQ-LIFE-003).

import { MSG } from '../shared/messages.js';

let session = null; // { tabId, port }
let pendingTabId = null;

const PUZZLE_HOST = /^https:\/\/www\.nytimes\.com\//;
const DEV_FIXTURE = /^http:\/\/localhost:8787\//; // fake page rehearsal (build:dev)

function flashBadge(text) {
  chrome.action.setBadgeText({ text });
  setTimeout(() => chrome.action.setBadgeText({ text: session ? 'ON' : '' }), 1500);
}

function closeSession() {
  try {
    session?.port.postMessage({ type: MSG.CLOSE });
  } catch { /* port already dead */ }
  session = null;
  chrome.action.setBadgeText({ text: '' });
}

chrome.action.onClicked.addListener((tab) => {
  if (session?.tabId === tab.id) { // toggle off (REQ-LIFE-002)
    closeSession();
    return;
  }
  if (session) closeSession(); // takeover from another tab (REQ-LIFE-009)

  const url = tab.url ?? '';
  if (!PUZZLE_HOST.test(url) && !DEV_FIXTURE.test(url)) {
    flashBadge('✕'); // REQ-LIFE-003 (non-NYT page)
    return;
  }

  pendingTabId = tab.id;
  // Must be called synchronously in the click handler: any await first (even a
  // sidePanel.setOptions) drops the user-gesture context and Chrome silently
  // refuses to open the panel. The panel path comes from the manifest default.
  chrome.sidePanel.open({ tabId: tab.id });
});

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== MSG.PANEL_PORT) return;
  session = { tabId: pendingTabId, port };
  chrome.action.setBadgeText({ text: 'ON' });
  port.onMessage.addListener((msg) => {
    if (msg?.type === MSG.HELLO) port.postMessage({ type: MSG.TAB, tabId: session?.tabId ?? null });
  });
  port.onDisconnect.addListener(() => {
    if (session?.port === port) {
      session = null;
      chrome.action.setBadgeText({ text: '' });
    }
  });
});

chrome.tabs.onRemoved.addListener((tabId) => {
  if (session?.tabId === tabId) closeSession(); // REQ-LIFE-008
});
