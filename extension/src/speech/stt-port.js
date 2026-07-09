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
  // REQ-SPCH-011: contextual biasing. Both injectable for tests. Chrome exposes biasing only
  // on the on-device path, so it is gated behind a one-time availability probe; when absent,
  // phrases are ignored and recognition runs exactly as before.
  Phrase = globalThis.SpeechRecognitionPhrase,
  availableOnDevice = globalThis.SpeechRecognition?.available?.bind(globalThis.SpeechRecognition),
  lang = DEFAULT_LANG,
  maxAlternatives = 5,
  // REQ-SPCH-010: a pause this long in the MIDDLE of an utterance (interim hypotheses
  // exist but the engine hasn't finalized) drops the half-heard input and surfaces
  // {error:'reset'} — the caller reopens a fresh cycle. Prevents "heart heart" doubles
  // when the engine misses its endpoint and the user repeats themselves. 0 disables.
  pauseResetMs = 1200,
} = {}) {
  let current = null;
  let onDeviceProbe = null; // memoized Promise<boolean> — probe the on-device path at most once

  const canBias = () => typeof Phrase === 'function' && typeof availableOnDevice === 'function';

  // Is Chrome's on-device recognition (which biasing requires) available right now? Probed
  // once and cached; only 'available' counts — we never trigger a language-pack download.
  function probeOnDevice() {
    if (!onDeviceProbe) {
      onDeviceProbe = (async () => {
        if (!canBias()) return false;
        try {
          return (await availableOnDevice({ langs: [lang], processLocally: true })) === 'available';
        } catch {
          return false;
        }
      })();
    }
    return onDeviceProbe;
  }

  // Attach biasing phrases to a live recognizer (REQ-SPCH-011). Best-effort: any failure
  // falls back to un-biased recognition rather than breaking the listen cycle.
  function applyBias(rec, phrases) {
    try {
      rec.processLocally = true;
      for (const { phrase, boost } of phrases) rec.phrases.push(new Phrase(phrase, boost));
    } catch { /* biasing unsupported here — recognize without it */ }
  }

  return {
    available: Boolean(Recognition),

    /**
     * One listen cycle. Resolves {alternatives:[{transcript, confidence}]} or {error}.
     * Never rejects. A cycle ending without any result maps to {error:'no-speech'};
     * a mid-utterance pause past pauseResetMs maps to {error:'reset'} (REQ-SPCH-010).
     * @param {{phrases?: Array<{phrase: string, boost: number}>}} [opts]  REQ-SPCH-011:
     *   contextual-biasing phrases; applied only when Chrome's on-device path is available,
     *   otherwise ignored (the transcript path is then identical to an un-biased cycle).
     */
    listenOnce({ phrases } = {}) {
      if (!Recognition) return Promise.resolve({ error: 'other' });
      const bias = phrases?.length && canBias() ? phrases : null;
      const start = (onDevice) => new Promise((resolve) => {
        const rec = new Recognition();
        current = rec;
        let settled = false;
        let timer = null;
        let lastInterimAt = 0; // 0 = the user hasn't started speaking yet
        const settle = (value) => {
          if (settled) return;
          settled = true;
          if (timer != null) globalThis.clearInterval(timer);
          timer = null;
          if (current === rec) current = null;
          resolve(value);
        };

        rec.lang = lang;
        rec.maxAlternatives = maxAlternatives;
        // Interim hypotheses are the "user is still speaking" signal the pause monitor
        // needs; they are never delivered to the caller.
        rec.interimResults = pauseResetMs > 0;
        rec.continuous = false;
        if (onDevice && bias) applyBias(rec, bias); // REQ-SPCH-011

        rec.onresult = (event) => {
          const results = event.results ?? [];
          let result = null;
          for (let i = 0; i < results.length; i++) {
            // Engines omit isFinal when interimResults is off — treat that as final.
            if (results[i] && results[i].isFinal !== false) {
              result = results[i];
              break;
            }
          }
          if (!result) {
            lastInterimAt = Date.now(); // interim only: the utterance is still forming
            return;
          }
          const alternatives = [];
          for (let i = 0; i < result.length; i++) {
            const alt = result[i];
            if (alt?.transcript) {
              alternatives.push({ transcript: alt.transcript, confidence: alt.confidence ?? 0 });
            }
          }
          settle(alternatives.length ? { alternatives } : { error: 'no-speech' });
        };
        rec.onerror = (event) => settle({ error: mapSttError(event?.error) });
        rec.onend = () => settle({ error: 'no-speech' });

        if (pauseResetMs > 0) {
          timer = globalThis.setInterval(() => {
            if (lastInterimAt && Date.now() - lastInterimAt >= pauseResetMs) {
              settle({ error: 'reset' }); // REQ-SPCH-010: discard and start fresh
              try {
                rec.abort();
              } catch { /* already gone */ }
            }
          }, Math.min(100, pauseResetMs));
        }

        try {
          rec.start();
        } catch {
          settle({ error: 'other' });
        }
      });
      // Only await the (memoized) on-device probe when biasing is actually requested — the
      // un-biased path stays synchronous and byte-for-byte unchanged.
      return bias ? probeOnDevice().then(start) : start(false);
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
