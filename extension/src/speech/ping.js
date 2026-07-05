// Ready/reset ping (REQ-SPCH-010): a tiny tick — the audible blinking cursor — played
// whenever the formal mic opens, so the user knows "you can speak now" after a readout
// and "everything was reset, start over" after a mid-utterance pause reset. Web Audio
// (page context; allowed after the session-starting user gesture), best-effort only:
// a page without audio just gets no tick, never an error.

export function createPing({
  AudioContextCtor = globalThis.AudioContext ?? globalThis.webkitAudioContext,
} = {}) {
  let ctx = null;
  return {
    play() {
      if (!AudioContextCtor) return;
      try {
        ctx ??= new AudioContextCtor();
        if (ctx.state === 'suspended') void ctx.resume?.();
        const t = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = 880; // short, high, quiet: a tick, not a tone
        gain.gain.setValueAtTime(0.08, t);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
        osc.connect(gain).connect(ctx.destination);
        osc.start(t);
        osc.stop(t + 0.09);
      } catch { /* audio unavailable — the ping is best-effort */ }
    },
    dispose() {
      try {
        void ctx?.close?.();
      } catch { /* already closed */ }
      ctx = null;
    },
  };
}
