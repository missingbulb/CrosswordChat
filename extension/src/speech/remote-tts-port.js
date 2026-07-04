// TTS port for the in-page session (REQ-SPCH-001): chrome.tts only exists in
// extension contexts, so speak/cancel are relayed to the service worker over the
// session port. Same speak()/cancel() contract as tts-port.js.

import { MSG } from '../shared/messages.js';

export function createRemoteTtsPort(port) {
  let nextId = 1;
  const pending = new Map(); // id → resolve

  port.onMessage.addListener((msg) => {
    if (msg?.type !== MSG.SPEAK_DONE) return;
    pending.get(msg.id)?.();
    pending.delete(msg.id);
  });
  port.onDisconnect.addListener(() => {
    // Service worker gone: never leave the orchestrator awaiting a dead utterance.
    for (const resolve of pending.values()) resolve();
    pending.clear();
  });

  return {
    /** Speak text; resolves when done (or the relay dies). Never rejects. */
    speak(text) {
      return new Promise((resolve) => {
        const id = nextId++;
        pending.set(id, resolve);
        try {
          port.postMessage({ type: MSG.SPEAK, id, text });
        } catch {
          pending.delete(id);
          resolve();
        }
      });
    },
    /** Immediate silence (REQ-LIFE-002). */
    cancel() {
      try {
        port.postMessage({ type: MSG.TTS_CANCEL });
      } catch { /* port already dead — nothing is speaking */ }
    },
  };
}
