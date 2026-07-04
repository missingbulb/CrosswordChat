// Content script: hosts the whole conversation inside the puzzle page — brain, voice,
// and hands in one place. Speech-only by design: no visual UI; what was said/heard goes
// to the page console for debugging (REQ-SPCH-007/008). Inert until asked
// (REQ-NFR-004): registering the message listener is the only load-time side effect.
// The session dies with the page (reload/navigation) — that is intended (REQ-LIFE-008).

import { MSG } from '../shared/messages.js';
import { snapshot } from '../page-adapter/reader.js';
import { enterAnswer, clearEntry } from '../page-adapter/writer.js';
import { selectClue } from '../page-adapter/navigator.js';
import { probe } from '../page-adapter/probe.js';
import { createWatcher } from '../page-adapter/watcher.js';
import { createOrchestrator } from '../app/orchestrator.js';
import { createSttPort } from '../speech/stt-port.js';
import { createRemoteTtsPort } from '../speech/remote-tts-port.js';

const TAG = '[CrosswordChat]';
let session = null; // { orchestrator, port }

function createPageClient() {
  let watcher = null;
  return {
    snapshot: async () => snapshot(document),
    enterAnswer: async (cells) => enterAnswer(document, cells),
    clearEntry: async (cellIndices) => clearEntry(document, cellIndices),
    selectClue: async (clueId) => ({ ok: selectClue(document, clueId) }),
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
  };
}

async function startSession() {
  if (session) return; // duplicate START (e.g. double-click) — one session per page
  const port = chrome.runtime.connect({ name: MSG.SESSION_PORT });
  const stt = createSttPort();
  const tts = createRemoteTtsPort(port);

  const orchestrator = createOrchestrator({
    tts,
    stt,
    pageClient: createPageClient(),
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
      try {
        port.disconnect(); // badge clears in the service worker
      } catch { /* already gone */ }
    },
  });
  session = { orchestrator, port };

  port.onMessage.addListener((msg) => {
    if (msg?.type === MSG.CLOSE) orchestrator.stop(); // icon toggle / takeover
  });
  port.onDisconnect.addListener(() => orchestrator.stop()); // service worker died

  // Surface the mic prompt (page origin) at a sane moment (REQ-SPCH-003); recognition
  // errors still flow through the machine if the user denies here.
  await stt.ensureMicPermission();
  await orchestrator.start();
}

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
  return false; // all responses are synchronous
});
