// Text-to-speech port (REQ-SPCH-001): chrome.tts primary (immune to page autoplay
// rules), speechSynthesis fallback. Injectable for tests.

export function createTtsPort({
  chromeTts = globalThis.chrome?.tts,
  synth = globalThis.speechSynthesis,
  rate = 1.0,
} = {}) {
  return {
    /** Speak text; resolves when done (or interrupted/cancelled). Never rejects. */
    speak(text) {
      if (chromeTts) {
        return new Promise((resolve) => {
          chromeTts.speak(text, {
            rate,
            enqueue: false,
            onEvent(event) {
              if (['end', 'interrupted', 'cancelled', 'error'].includes(event.type)) resolve();
            },
          });
        });
      }
      if (synth) {
        return new Promise((resolve) => {
          const view = globalThis;
          const utterance = new view.SpeechSynthesisUtterance(text);
          utterance.rate = rate;
          utterance.onend = () => resolve();
          utterance.onerror = () => resolve();
          synth.speak(utterance);
        });
      }
      return Promise.resolve(); // headless (tests): speaking is a no-op
    },
    /** Immediate silence (REQ-LIFE-002). */
    cancel() {
      chromeTts?.stop?.();
      synth?.cancel?.();
    },
  };
}
