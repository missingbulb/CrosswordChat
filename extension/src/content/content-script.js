// Content script: hosts the whole conversation inside the puzzle page — brain, voice,
// and hands in one place. Speech-only by design: what was said/heard goes to the page
// console for debugging (REQ-SPCH-007/008). Inert until asked (REQ-NFR-004): the only
// load-time side effects are registering the message listener and placing the toolbar
// toggle button (REQ-LIFE-012 — the spec's one carve-out). The session dies with the
// page (reload/navigation) — that is intended (REQ-LIFE-008).

import { MSG } from '../shared/messages.js';
import { snapshot, isRuledWrong } from '../page-adapter/reader.js';
import { enterAnswer, clearEntry, keepAlive } from '../page-adapter/writer.js';
import { selectClue } from '../page-adapter/navigator.js';
import { probe } from '../page-adapter/probe.js';
import { createWatcher } from '../page-adapter/watcher.js';
import { mountSessionButton } from '../page-adapter/session-button.js';
import { mountSettingsModal } from '../page-adapter/settings-modal.js';
import { dismissSplash, waitForSplashClear } from '../page-adapter/splash.js';
import { render } from '../conversation/phrases.js';
import { createOrchestrator } from '../app/orchestrator.js';
import { createSttPort } from '../speech/stt-port.js';
import { createRemoteTtsPort } from '../speech/remote-tts-port.js';
import { createPing } from '../speech/ping.js';
import { loadSettings } from '../settings/settings.js';

const TAG = '[CrosswordChat]';
let session = null; // { orchestrator, port }
let starting = false; // guards the async gap before `session` exists (button double-click)

function createPageClient() {
  let watcher = null;
  return {
    snapshot: async () => snapshot(document),
    enterAnswer: async (cells) => enterAnswer(document, cells),
    clearEntry: async (cellIndices) => clearEntry(document, cellIndices),
    selectClue: async (clueId) => ({ ok: selectClue(document, clueId) }),
    // Full-grid verdict (REQ-LIFE-005/006): the page rules with a popup — congrats
    // (snapshot.status 'solved') or "Keep trying". The orchestrator waits for one and
    // reacts; the negative one is clicked away so the board is usable again — the
    // splash dismisser already knows how to click a modal's Keep-trying/Play button.
    ruledWrong: async () => isRuledWrong(document),
    dismissVerdict: async () => dismissSplash(document, { waitMs: 1500 }),
    watch: async (cb) => {
      if (watcher) return;
      watcher = createWatcher(document, cb);
      watcher.start();
    },
    unwatch: async () => {
      watcher?.stop();
      watcher = null;
    },
    // Our own typing must not look like user activity (REQ-NAV-008).
    pauseWatch: () => watcher?.pause(),
    resumeWatch: () => watcher?.resume(),
    // A heard user command keeps NYT from auto-pausing a quiet puzzle (REQ-LIFE-017).
    keepAlive: () => keepAlive(document),
  };
}

async function startSession() {
  if (session || starting) return; // duplicate START (e.g. double-click) — one session per page
  starting = true;
  try {
    const port = chrome.runtime.connect({ name: MSG.SESSION_PORT });
    const stt = createSttPort();
    const tts = createRemoteTtsPort(port);
    const settings = await loadSettings(); // REQ-NAV-012: options-page choices apply per session

    const orchestrator = createOrchestrator({
      tts,
      stt,
      pageClient: createPageClient(),
      settings,
      ping: createPing(), // REQ-SPCH-010: audible "mic open / reset" tick

      ui: {
        caption: (role, text) => {
          if (!text) return;
          console.info(`${TAG} ${role === 'heard' ? `heard: “${text}”` : text}`); // REQ-SPCH-007/008
        },
        listening: (on) => console.debug(`${TAG} mic ${on ? 'on' : 'off'}`),
      },
      onEnd: () => {
        console.info(`${TAG} session ended`);
        session = null;
        toggleButton.setActive(false);
        document.removeEventListener('keydown', onKeydown, true);
        try {
          port.disconnect(); // badge clears in the service worker
        } catch { /* already gone */ }
      },
    });
    session = { orchestrator, port };
    toggleButton.setActive(true);

    // REQ-LIFE-015: Escape ends the session instantly, like the toggle. Only real
    // key presses count (isTrusted) — synthetic events can never end the session.
    // NYT binds Escape too (it opens rebus entry): during a session the key is OURS —
    // capture-phase on document runs before the app's delegated handler, and stopping
    // propagation keeps the rebus box from popping alongside the teardown.
    const onKeydown = (event) => {
      if (event.key === 'Escape' && event.isTrusted) {
        event.stopPropagation();
        event.preventDefault();
        orchestrator.stop();
      }
    };
    document.addEventListener('keydown', onKeydown, true);

    port.onMessage.addListener((msg) => {
      if (msg?.type === MSG.CLOSE) orchestrator.stop(); // icon toggle / takeover
    });
    port.onDisconnect.addListener(() => orchestrator.stop()); // service worker died

    // Surface the mic prompt (page origin) at a sane moment (REQ-SPCH-003); recognition
    // errors still flow through the machine if the user denies here.
    await stt.ensureMicPermission();

    // REQ-LIFE-016: the pre-puzzle splash ("Ready to start solving?") hides the board.
    // Click Play for the user; if the page insists on a real click, ask them to and
    // wait — the session then starts the moment the board appears.
    if (!(await dismissSplash(document))) {
      await tts.speak(render({ kind: 'splash' }));
      if (!(await waitForSplashClear(document))) {
        orchestrator.stop();
        return;
      }
    }
    await orchestrator.start();
  } finally {
    starting = false;
  }
}

// The in-page split button (REQ-LIFE-012): the main half has the same semantics as the
// extension icon — start when idle (REQ-LIFE-001), instant silent stop mid-session
// (REQ-LIFE-002); the caret opens Settings and the voice-command reference (REQ-CMD-007).
// Settings opens a centred in-page modal that mirrors NYT's own Puzzle Settings popup
// (REQ-NAV-012) — no extension window; the extension icon's Settings route is unchanged.
// Help still opens an extension page, which only the worker can do (REQ-CMD-007). Mounts
// as soon as the NYT toolbar renders; quietly absent when it never does.
let settingsModal = null;
const toggleButton = mountSessionButton(document, {
  onToggle: () => {
    if (session) session.orchestrator.stop();
    else void startSession();
  },
  onSettings: () => {
    settingsModal = mountSettingsModal(document, { onClose: () => { settingsModal = null; } });
  },
  onHelp: () => chrome.runtime.sendMessage({ type: MSG.OPEN_HELP }).catch(() => {}),
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  switch (msg?.type) {
    case MSG.START:
      void startSession();
      sendResponse({ ok: true });
      break;
    case MSG.PING:
      sendResponse({ ok: true });
      break;
    case MSG.SNAPSHOT: // debugging (service-worker console)
      sendResponse(snapshot(document));
      break;
    case MSG.PROBE: // debugging (MT-01)
      sendResponse(probe(document));
      break;
    default:
      return false; // not ours
  }
  return false; // all responses are synchronous (writes happen via the in-page orchestrator)
});
