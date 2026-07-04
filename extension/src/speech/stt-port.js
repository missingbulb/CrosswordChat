// Speech-to-text port (REQ-SPCH-002/003/004): wraps webkitSpeechRecognition into
// one-utterance listen cycles with an n-best result and a small error taxonomy.
// The recognizer constructor is injectable so behavior is unit-testable.

export const DEFAULT_LANG = 'en-US'; // REQ-NFR-005

/** Raw Web Speech error name → our taxonomy. */
export function mapSttError(name) {
  switch (name) {
    case 'not-allowed':
    case 'service-not-allowed':
      return 'not-allowed';
    case 'no-speech':
      return 'no-speech';
    case 'network':
      return 'network';
    case 'aborted':
      return 'aborted';
    case 'audio-capture':
      return 'audio-capture';
    default:
      return 'other';
  }
}

export function createSttPort({
  Recognition = globalThis.SpeechRecognition ?? globalThis.webkitSpeechRecognition,
  lang = DEFAULT_LANG,
  maxAlternatives = 5,
} = {}) {
  let current = null;

  return {
    available: Boolean(Recognition),

    /**
     * One listen cycle. Resolves {alternatives:[{transcript, confidence}]} or {error}.
     * Never rejects. A cycle ending without any result maps to {error:'no-speech'}.
     */
    listenOnce() {
      if (!Recognition) return Promise.resolve({ error: 'other' });
      return new Promise((resolve) => {
        const rec = new Recognition();
        current = rec;
        let settled = false;
        const settle = (value) => {
          if (settled) return;
          settled = true;
          if (current === rec) current = null;
          resolve(value);
        };

        rec.lang = lang;
        rec.maxAlternatives = maxAlternatives;
        rec.interimResults = false;
        rec.continuous = false;

        rec.onresult = (event) => {
          const result = event.results?.[0];
          const alternatives = [];
          for (let i = 0; result && i < result.length; i++) {
            const alt = result[i];
            if (alt?.transcript) {
              alternatives.push({ transcript: alt.transcript, confidence: alt.confidence ?? 0 });
            }
          }
          settle(alternatives.length ? { alternatives } : { error: 'no-speech' });
        };
        rec.onerror = (event) => settle({ error: mapSttError(event?.error) });
        rec.onend = () => settle({ error: 'no-speech' });

        try {
          rec.start();
        } catch {
          settle({ error: 'other' });
        }
      });
    },

    /** Abort the in-flight cycle (surfaces as 'aborted', which the machine ignores). */
    stop() {
      try {
        current?.abort();
      } catch { /* already stopped */ }
      current = null;
    },

    /**
     * Surface the mic permission prompt in a controlled moment (REQ-SPCH-003).
     * @returns {Promise<'granted'|'denied'|'unknown'>}
     */
    async ensureMicPermission({ nav = globalThis.navigator } = {}) {
      try {
        const status = await nav?.permissions?.query?.({ name: 'microphone' });
        if (status?.state === 'granted') return 'granted';
        if (status?.state === 'denied') return 'denied';
      } catch { /* permissions API unavailable — fall through */ }
      try {
        const stream = await nav?.mediaDevices?.getUserMedia?.({ audio: true });
        stream?.getTracks?.().forEach((t) => t.stop());
        return 'granted';
      } catch {
        return 'denied';
      }
    },
  };
}
