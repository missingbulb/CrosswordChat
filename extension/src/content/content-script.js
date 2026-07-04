// Content script: the "hands". A dumb command executor over the page adapter.
// Inert until asked (REQ-NFR-004): registering this listener is its only side effect;
// no DOM reads, writes, or observers happen before a message arrives.

import { MSG } from '../shared/messages.js';
import { snapshot } from '../page-adapter/reader.js';
import { enterAnswer, clearEntry } from '../page-adapter/writer.js';
import { selectClue } from '../page-adapter/navigator.js';
import { probe } from '../page-adapter/probe.js';
import { createWatcher } from '../page-adapter/watcher.js';

let watcher = null;

function startWatching() {
  if (watcher) return;
  watcher = createWatcher(document, (kind, snap) => {
    chrome.runtime.sendMessage({ type: MSG.PAGE_EVENT, kind, snapshot: snap }).catch(() => {});
  });
  watcher.start();
}

function stopWatching() {
  watcher?.stop();
  watcher = null;
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  switch (msg?.type) {
    case MSG.PING:
      sendResponse({ ok: true });
      break;
    case MSG.SNAPSHOT:
      sendResponse(snapshot(document));
      break;
    case MSG.ENTER: {
      watcher?.pause();
      const result = enterAnswer(document, msg.cells);
      watcher?.resume();
      sendResponse(result);
      break;
    }
    case MSG.CLEAR: {
      watcher?.pause();
      const result = clearEntry(document, msg.cellIndices);
      watcher?.resume();
      sendResponse(result);
      break;
    }
    case MSG.SELECT:
      sendResponse({ ok: selectClue(document, msg.clueId) });
      break;
    case MSG.PROBE:
      sendResponse(probe(document));
      break;
    case MSG.WATCH:
      startWatching();
      sendResponse({ ok: true });
      break;
    case MSG.UNWATCH:
      stopWatching();
      sendResponse({ ok: true });
      break;
    default:
      return false; // not ours
  }
  return false; // all responses are synchronous
});
