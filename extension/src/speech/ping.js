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
    // A tiny descending two-step blip: "the session is stopping" (REQ-LIFE-017), played
    // when NYT pauses the puzzle out from under a live session. Runs in its OWN
    // short-lived context that self-closes, so it still sounds even as teardown disposes
    // the ready-tick context above. Best-effort: no audio, no blip, never an error.
    off() {
      if (!AudioContextCtor) return;
      try {
        const c = new AudioContextCtor();
        if (c.state === 'suspended') void c.resume?.();
        const t = c.currentTime;
        const osc = c.createOscillator();
        const gain = c.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(660, t);
        osc.frequency.exponentialRampToValueAtTime(330, t + 0.16); // downward = "off"
        gain.gain.setValueAtTime(0.08, t);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
        osc.connect(gain).connect(c.destination);
        osc.start(t);
        osc.stop(t + 0.18);
        setTimeout(() => { try { void c.close?.(); } catch { /* already closed */ } }, 400);
      } catch { /* audio unavailable — the blip is best-effort */ }
    },
    dispose() {
      try {
        void ctx?.close?.();
      } catch { /* already closed */ }
      ctx = null;
    },
  };
}
