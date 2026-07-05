// Text-to-speech port (REQ-SPCH-001): chrome.tts primary (immune to page autoplay
// rules), speechSynthesis fallback. Injectable for tests.

// The OS default voice is often the most robotic one installed. Prefer these
// (first installed match wins); fall back to the system default (REQ-SPCH-001).
// 'Google US English' used to lead this list but sounded bad to users, so the
// UK voices now outrank it; it stays last as a better-than-default fallback.
export const PREFERRED_VOICES = [
  'Google UK English Female', // ships with desktop Chrome, like the other Google voices
  'Google UK English Male',
  'Samantha', // macOS
  'Google US English',
];

// Solvers listen to a LOT of prompts, but taste varies — feedback drove the fixed
// rate 1.5× → 2.0× and then back down. 1.3× is the shipping default; the options
// page lets each user pick their own, passed per utterance (REQ-SPCH-001). This is
// only the fallback when no rate is given.
export const DEFAULT_RATE = 1.3;

export function createTtsPort({
  chromeTts = globalThis.chrome?.tts,
  synth = globalThis.speechSynthesis,
  rate = DEFAULT_RATE,
  preferredVoices = PREFERRED_VOICES,
} = {}) {
  let voiceName = null;
  let voiceResolved = false;

  // Resolved on first speak; engines load their voice lists lazily, so an empty
  // list means "not ready yet — use the default and try again next time".
  async function resolveVoice() {
    if (voiceResolved) return voiceName;
    const installed = chromeTts?.getVoices
      ? ((await chromeTts.getVoices()) ?? []).map((v) => v.voiceName)
      : (synth?.getVoices?.() ?? []).map((v) => v.name);
    if (installed.length === 0) return null;
    voiceResolved = true;
    voiceName = preferredVoices.find((name) => installed.includes(name)) ?? null;
    return voiceName;
  }

  return {
    /**
     * Speak text, at `rate` when given (the user's setting) or the port's default.
     * Resolves when done (or interrupted/cancelled). Never rejects.
     */
    async speak(text, { rate: utteranceRate = rate } = {}) {
      const voice = await resolveVoice();
      if (chromeTts) {
        return new Promise((resolve) => {
          const options = {
            rate: utteranceRate,
            enqueue: false,
            onEvent(event) {
              if (['end', 'interrupted', 'cancelled', 'error'].includes(event.type)) resolve();
            },
          };
          if (voice) options.voiceName = voice;
          chromeTts.speak(text, options);
        });
      }
      if (synth) {
        return new Promise((resolve) => {
          const view = globalThis;
          const utterance = new view.SpeechSynthesisUtterance(text);
          utterance.rate = utteranceRate;
          if (voice) {
            const match = synth.getVoices().find((v) => v.name === voice);
            if (match) utterance.voice = match;
          }
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
