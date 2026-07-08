// Service worker: the "switchboard" and the mouth. Icon toggle (REQ-LIFE-001/002),
// one session at a time (REQ-LIFE-009), badge feedback (REQ-LIFE-003), per-tab icon
// variant + unsupported-site popup (REQ-LIFE-013/014), the Settings… menu item that
// anchors the settings popup under the toolbar icon (REQ-NAV-012), session end when the
// puzzle tab loses the user's attention (REQ-LIFE-011), and the chrome.tts relay —
// content scripts can't use chrome.tts, so the in-page session sends speak/cancel here
// over its port (REQ-SPCH-001).

import { MSG } from '../shared/messages.js';
import { isSupportedPuzzleUrl } from '../shared/urls.js';
import { createTtsPort } from '../speech/tts-port.js';
import { render } from '../conversation/phrases.js';
import { loadSettings } from '../settings/settings.js';

let session = null; // { tabId, port }
const tts = createTtsPort();

// Everything spoken goes through here: the rate is the user's options-page setting,
// read per utterance so a mid-session change applies from the next line (REQ-SPCH-001).
async function speakAtUserRate(text) {
  const { rate } = await loadSettings();
  return tts.speak(text, { rate });
}

function flashBadge(text) {
  chrome.action.setBadgeText({ text });
  setTimeout(() => chrome.action.setBadgeText({ text: session ? 'ON' : '' }), 1500);
}

// REQ-LIFE-013/014: the icon tells the user where CrosswordChat works, and clicking it
// anywhere else opens the unsupported-site popup instead of doing nothing visible.
// URL-only decision (isSupportedPuzzleUrl); without the "tabs" permission non-NYT tabs
// report no URL at all, which lands on the same answer: unsupported.
const iconSet = (suffix) =>
  Object.fromEntries([16, 32, 48, 128].map((px) => [px, `icons/icon-${px}${suffix}.png`]));
const ICONS_SUPPORTED = iconSet('');
const ICONS_UNSUPPORTED = iconSet('-gray');

function presentAction(tabId, url) {
  const supported = isSupportedPuzzleUrl(url);
  chrome.action.setIcon({ tabId, path: supported ? ICONS_SUPPORTED : ICONS_UNSUPPORTED })
    .catch(() => { /* tab already gone */ });
  // '' clears the popup so onClicked fires and toggles the session directly.
  chrome.action.setPopup({ tabId, popup: supported ? '' : 'unsupported.html' })
    .catch(() => { /* tab already gone */ });
}

// REQ-NAV-012: settings live in the action popup, not Chrome's options_ui — options_ui
// would bounce the user through chrome://extensions and back. The right-click Settings…
// item borrows the tab's popup slot for one click: point it at the settings page, pop it
// open under the icon, then hand the slot straight back so the next plain click still
// toggles the session (or shows unsupported.html).
const SETTINGS_MENU_ID = 'cc-settings';

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: SETTINGS_MENU_ID,
      title: 'Settings…',
      contexts: ['action'],
    });
  });
});

async function openSettingsPopup(tab) {
  try {
    await chrome.action.setPopup({ tabId: tab.id, popup: 'options.html' });
    await chrome.action.openPopup({ windowId: tab.windowId });
  } catch {
    // openPopup needs Chrome 127+; older Chrome gets a small standalone window instead.
    await chrome.windows.create({ url: 'options.html', type: 'popup', width: 380, height: 480 })
      .catch(() => { /* window creation blocked — nothing else to try */ });
  } finally {
    presentAction(tab.id, tab.url); // give the popup slot back to the session toggle
  }
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== SETTINGS_MENU_ID || !tab?.id) return;
  void openSettingsPopup(tab);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url || changeInfo.status === 'loading') presentAction(tabId, tab.url);
});
// Startup sweep: tabs that were already open when the worker woke up.
chrome.tabs.query({}).then((tabs) => {
  for (const tab of tabs) if (tab.id != null) presentAction(tab.id, tab.url);
}).catch(() => { /* no tabs access in this profile state */ });

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

  if (!isSupportedPuzzleUrl(tab.url)) {
    // Normally unreachable — unsupported tabs open the popup instead of firing this
    // (REQ-LIFE-014). Cold-start safety net: badge feedback, and heal the tab's
    // icon/popup so the next click explains itself (REQ-LIFE-003).
    flashBadge('✕');
    presentAction(tab.id, tab.url);
    return;
  }

  chrome.tabs.sendMessage(tab.id, { type: MSG.START }).catch(() => {
    // Supported-looking URL but no content script to host a session, and no UI to
    // explain — so say it by voice (REQ-LIFE-003).
    flashBadge('✕');
    void speakAtUserRate(render({ kind: 'no-puzzle' }));
  });
});

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== MSG.SESSION_PORT) return;
  // Sessions can start from the in-page button (REQ-LIFE-012) without passing through
  // onClicked — enforce one-at-a-time here, where every session registers (REQ-LIFE-009).
  if (session && session.port !== port) closeSession();
  session = { tabId: port.sender?.tab?.id ?? null, port };
  chrome.action.setBadgeText({ text: 'ON' });
  port.onMessage.addListener(async (msg) => {
    if (msg?.type === MSG.SPEAK) {
      await speakAtUserRate(msg.text);
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

// REQ-LIFE-011: the mic never stays open on a puzzle the user isn't looking at. We don't
// track tab/window focus here — instead we piggyback on NYT itself: looking away pauses
// the puzzle (as does ~30 s idle), the in-page watcher sees the pause, and the session
// ends with a tiny blip (REQ-LIFE-017). One signal — NYT's pause — covers both cases.

chrome.tabs.onActivated.addListener(({ tabId }) => {
  // Keep the newly focused tab's icon/popup honest even if the worker slept through
  // its navigation (REQ-LIFE-013/014).
  chrome.tabs.get(tabId).then((tab) => presentAction(tabId, tab.url)).catch(() => {});
});
