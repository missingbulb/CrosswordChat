// Service worker: the "switchboard" and the mouth. Icon toggle (REQ-LIFE-001/002),
// one session at a time (REQ-LIFE-009), badge feedback (REQ-LIFE-003), session end
// when the puzzle tab loses the user's attention (REQ-LIFE-011), and the chrome.tts
// relay — content scripts can't use chrome.tts, so the in-page session sends
// speak/cancel here over its port (REQ-SPCH-001).

import { MSG } from '../shared/messages.js';
import { createTtsPort } from '../speech/tts-port.js';
import { render } from '../conversation/phrases.js';

let session = null; // { tabId, port }
const tts = createTtsPort();

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
  tts.cancel(); // REQ-LIFE-002: instant silence, even mid-utterance
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

  chrome.tabs.sendMessage(tab.id, { type: MSG.START }).catch(() => {
    // NYT page outside the crossword section: no content script there to host a
    // session, and no UI to explain — so say it by voice (REQ-LIFE-003).
    flashBadge('✕');
    tts.speak(render({ kind: 'no-puzzle' }));
  });
});

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== MSG.SESSION_PORT) return;
  session = { tabId: port.sender?.tab?.id ?? null, port };
  chrome.action.setBadgeText({ text: 'ON' });
  port.onMessage.addListener(async (msg) => {
    if (msg?.type === MSG.SPEAK) {
      await tts.speak(msg.text);
      try {
        port.postMessage({ type: MSG.SPEAK_DONE, id: msg.id });
      } catch { /* session ended while speaking */ }
    } else if (msg?.type === MSG.TTS_CANCEL) {
      tts.cancel();
    }
  });
  port.onDisconnect.addListener(() => {
    if (session?.port === port) {
      session = null;
      tts.cancel(); // page reloaded/closed mid-speech (REQ-LIFE-008): go quiet
      chrome.action.setBadgeText({ text: '' });
    }
  });
});

// REQ-LIFE-011: the mic never stays open on a puzzle the user isn't looking at.
// Switching to another tab, another Chrome window, or another app ends the
// session — silently, like the icon toggle.
async function endSessionIfHidden() {
  if (!session) return;
  const { tabId } = session;
  try {
    const tab = await chrome.tabs.get(tabId);
    const win = await chrome.windows.get(tab.windowId);
    if (session?.tabId === tabId && (!tab.active || !win.focused)) closeSession();
  } catch {
    if (session?.tabId === tabId) closeSession(); // tab already gone
  }
}

chrome.tabs.onActivated.addListener(() => { void endSessionIfHidden(); });
chrome.windows.onFocusChanged.addListener(() => { void endSessionIfHidden(); });
