import { describe, test, expect, vi } from 'vitest';
import { createTtsPort, DEFAULT_RATE } from '../../extension/src/speech/tts-port.js';
import { createRemoteTtsPort } from '../../extension/src/speech/remote-tts-port.js';
import { createSttPort, mapSttError, DEFAULT_LANG, AUDIO_CONSTRAINTS } from '../../extension/src/speech/stt-port.js';
import { createPing } from '../../extension/src/speech/ping.js';
import { MSG } from '../../extension/src/shared/messages.js';

// ---- fakes -------------------------------------------------------------------

function makeFakeRecognition() {
  const instances = [];
  const script = []; // per-instance event lists
  class FakeRecognition {
    constructor() {
      this.phrases = []; // REQ-SPCH-011: on-device biasing target (an ObservableArray in Chrome)
      instances.push(this);
    }

    start() {
      const events = script.shift() ?? [{ type: 'end' }];
      queueMicrotask(() => {
        for (const e of events) {
          if (e.type === 'result') {
            // A SpeechRecognitionResult is array-like with an isFinal flag; interim
            // hypotheses (REQ-SPCH-010 pause monitor) carry final:false.
            const result = Object.assign(e.alternatives.slice(), { isFinal: e.final !== false });
            this.onresult?.({ results: [result] });
          } else if (e.type === 'error') this.onerror?.({ error: e.error });
          else this.onend?.();
        }
      });
    }

    abort() {
      this.onerror?.({ error: 'aborted' });
    }
  }
  return { FakeRecognition, instances, script };
}

const alt = (transcript, confidence) => ({ transcript, confidence });

// ---- TTS ----------------------------------------------------------------------

describe('tts port', () => {
  test('REQ-SPCH-001: chrome.tts primary — resolves on end, cancel stops', async () => {
    const calls = [];
    const chromeTts = {
      speak: (text, opts) => {
        calls.push(text);
        opts.onEvent({ type: 'end' });
      },
      stop: vi.fn(),
    };
    const tts = createTtsPort({ chromeTts, synth: undefined });
    await tts.speak('hello');
    expect(calls).toEqual(['hello']);
    tts.cancel();
    expect(chromeTts.stop).toHaveBeenCalled();
  });

  test('REQ-SPCH-001: speechSynthesis fallback when chrome.tts is absent', async () => {
    vi.stubGlobal('SpeechSynthesisUtterance', class {
      constructor(text) {
        this.text = text;
      }
    });
    const spoken = [];
    const synth = {
      speak: (utterance) => {
        spoken.push(utterance.text);
        utterance.onend();
      },
      cancel: vi.fn(),
    };
    const tts = createTtsPort({ chromeTts: undefined, synth });
    await tts.speak('fallback line');
    expect(spoken).toEqual(['fallback line']);
    tts.cancel();
    expect(synth.cancel).toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  test('headless (no engines) resolves instead of hanging', async () => {
    const tts = createTtsPort({ chromeTts: undefined, synth: undefined });
    await expect(tts.speak('x')).resolves.toBeUndefined();
  });

  test('REQ-SPCH-001: speaks at the 1.3× default rate when none is given', async () => {
    const rates = [];
    const chromeTts = {
      speak: (text, opts) => {
        rates.push(opts.rate);
        opts.onEvent({ type: 'end' });
      },
    };
    await createTtsPort({ chromeTts, synth: undefined }).speak('x');
    expect(rates).toEqual([DEFAULT_RATE]);
    expect(DEFAULT_RATE).toBe(1.3);
  });

  test('REQ-SPCH-001: a per-utterance rate (the user setting) reaches both engines', async () => {
    const rates = [];
    const chromeTts = {
      speak: (text, opts) => {
        rates.push(opts.rate);
        opts.onEvent({ type: 'end' });
      },
    };
    const viaChromeTts = createTtsPort({ chromeTts, synth: undefined });
    await viaChromeTts.speak('x', { rate: 2.4 });
    await viaChromeTts.speak('y'); // no override → back to the default

    vi.stubGlobal('SpeechSynthesisUtterance', class {
      constructor(text) {
        this.text = text;
      }
    });
    const synth = {
      speak: (utterance) => {
        rates.push(utterance.rate);
        utterance.onend();
      },
    };
    await createTtsPort({ chromeTts: undefined, synth }).speak('z', { rate: 0.8 });
    vi.unstubAllGlobals();

    expect(rates).toEqual([2.4, DEFAULT_RATE, 0.8]);
  });

  test('REQ-SPCH-010: the ready ping is best-effort — no audio, no error', () => {
    expect(() => createPing({ AudioContextCtor: undefined }).play()).not.toThrow();
    const ping = createPing({
      AudioContextCtor: class {
        constructor() { throw new Error('no audio device'); }
      },
    });
    expect(() => ping.play()).not.toThrow();
    expect(() => ping.dispose()).not.toThrow();
  });

  test('REQ-SPCH-001: speaks with the first installed preferred voice (UK Female outranks US)', async () => {
    const voicesUsed = [];
    const chromeTts = {
      getVoices: () => Promise.resolve([
        { voiceName: 'Robotic System Default' },
        { voiceName: 'Google US English' },
        { voiceName: 'Google UK English Female' },
      ]),
      speak: (text, opts) => {
        voicesUsed.push(opts.voiceName);
        opts.onEvent({ type: 'end' });
      },
    };
    const tts = createTtsPort({ chromeTts, synth: undefined });
    await tts.speak('one');
    await tts.speak('two');
    expect(voicesUsed).toEqual(['Google UK English Female', 'Google UK English Female']);
  });

  test('REQ-SPCH-001: lower-ranked preferred voice still beats the system default', async () => {
    const voicesUsed = [];
    const chromeTts = {
      getVoices: () => Promise.resolve([
        { voiceName: 'Robotic System Default' },
        { voiceName: 'Google US English' }, // last in the preference list, but installed
      ]),
      speak: (text, opts) => {
        voicesUsed.push(opts.voiceName);
        opts.onEvent({ type: 'end' });
      },
    };
    const tts = createTtsPort({ chromeTts, synth: undefined });
    await tts.speak('one');
    expect(voicesUsed).toEqual(['Google US English']);
  });

  test('REQ-SPCH-001: no preferred voice installed → system default (no voiceName set)', async () => {
    const voicesUsed = [];
    const chromeTts = {
      getVoices: () => Promise.resolve([{ voiceName: 'Robotic System Default' }]),
      speak: (text, opts) => {
        voicesUsed.push(opts.voiceName);
        opts.onEvent({ type: 'end' });
      },
    };
    const tts = createTtsPort({ chromeTts, synth: undefined });
    await tts.speak('hello');
    expect(voicesUsed).toEqual([undefined]);
  });

  test('REQ-SPCH-001: speechSynthesis fallback sets the preferred voice object', async () => {
    vi.stubGlobal('SpeechSynthesisUtterance', class {
      constructor(text) {
        this.text = text;
      }
    });
    const google = { name: 'Google US English', lang: 'en-US' };
    const voicesUsed = [];
    const synth = {
      getVoices: () => [{ name: 'Robotic System Default', lang: 'en-US' }, google],
      speak: (utterance) => {
        voicesUsed.push(utterance.voice);
        utterance.onend();
      },
    };
    const tts = createTtsPort({ chromeTts: undefined, synth });
    await tts.speak('x');
    expect(voicesUsed).toEqual([google]);
    vi.unstubAllGlobals();
  });
});

// ---- Remote TTS (content script → service worker relay) -----------------------

function makeFakePort() {
  const posted = [];
  const messageListeners = [];
  const disconnectListeners = [];
  return {
    posted,
    postMessage: (msg) => posted.push(msg),
    onMessage: { addListener: (fn) => messageListeners.push(fn) },
    onDisconnect: { addListener: (fn) => disconnectListeners.push(fn) },
    emit: (msg) => messageListeners.forEach((fn) => fn(msg)),
    drop: () => disconnectListeners.forEach((fn) => fn()),
  };
}

describe('remote tts port', () => {
  test('REQ-SPCH-001: speak posts over the port and resolves on the matching SPEAK_DONE', async () => {
    const port = makeFakePort();
    const tts = createRemoteTtsPort(port);
    const done = vi.fn();
    const pending = tts.speak('hello').then(done);
    expect(port.posted).toEqual([{ type: MSG.SPEAK, id: 1, text: 'hello' }]);
    port.emit({ type: MSG.SPEAK_DONE, id: 99 }); // someone else's utterance
    await Promise.resolve();
    expect(done).not.toHaveBeenCalled();
    port.emit({ type: MSG.SPEAK_DONE, id: 1 });
    await pending;
  });

  test('REQ-LIFE-002: cancel posts an immediate stop request', () => {
    const port = makeFakePort();
    createRemoteTtsPort(port).cancel();
    expect(port.posted).toEqual([{ type: MSG.TTS_CANCEL }]);
  });

  test('port death resolves in-flight speech instead of hanging the conversation', async () => {
    const port = makeFakePort();
    const tts = createRemoteTtsPort(port);
    const pending = tts.speak('doomed');
    port.drop();
    await expect(pending).resolves.toBeUndefined();
    // and a fully dead port never rejects
    port.postMessage = () => { throw new Error('disconnected'); };
    await expect(tts.speak('later')).resolves.toBeUndefined();
    expect(() => tts.cancel()).not.toThrow();
  });
});

// ---- STT ----------------------------------------------------------------------

describe('stt port', () => {
  test('REQ-SPCH-002/REQ-ANS-004: delivers the full n-best list in order', async () => {
    const { FakeRecognition, script } = makeFakeRecognition();
    script.push([{ type: 'result', alternatives: [alt('plain', 0.9), alt('plane', 0.7), alt('playing', 0.4)] }]);
    const stt = createSttPort({ Recognition: FakeRecognition });
    const result = await stt.listenOnce();
    expect(result.alternatives.map((a) => a.transcript)).toEqual(['plain', 'plane', 'playing']);
  });

  test('REQ-SPCH-002/REQ-NFR-005: recognizer configured en-US, ≥3 alternatives, one-shot', async () => {
    const { FakeRecognition, instances, script } = makeFakeRecognition();
    script.push([{ type: 'result', alternatives: [alt('hi', 1)] }]);
    const stt = createSttPort({ Recognition: FakeRecognition });
    await stt.listenOnce();
    const rec = instances[0];
    expect(rec.lang).toBe(DEFAULT_LANG);
    expect(rec.lang).toBe('en-US');
    expect(rec.maxAlternatives).toBeGreaterThanOrEqual(3);
    // Interim hypotheses feed the pause monitor (REQ-SPCH-010) but stay internal.
    expect(rec.interimResults).toBe(true);
    expect(rec.continuous).toBe(false);
  });

  test('REQ-SPCH-010: interim hypotheses are never delivered — only the final result is', async () => {
    const { FakeRecognition, script } = makeFakeRecognition();
    script.push([
      { type: 'result', alternatives: [alt('hea', 0.3)], final: false }, // interim
      { type: 'result', alternatives: [alt('heart', 0.9)] }, // final
    ]);
    const stt = createSttPort({ Recognition: FakeRecognition });
    const result = await stt.listenOnce();
    expect(result.alternatives.map((a) => a.transcript)).toEqual(['heart']);
  });

  test('REQ-SPCH-010: a mid-utterance pause past the limit resets the cycle', async () => {
    const { FakeRecognition, script } = makeFakeRecognition();
    script.push([{ type: 'result', alternatives: [alt('hear', 0.5)], final: false }]); // interim, then silence
    const stt = createSttPort({ Recognition: FakeRecognition, pauseResetMs: 30 });
    expect(await stt.listenOnce()).toEqual({ error: 'reset' });
  });

  test('REQ-SPCH-010: silence with no speech at all stays a plain no-speech, never a reset', async () => {
    const { FakeRecognition, script } = makeFakeRecognition();
    script.push([{ type: 'end' }]); // the engine gave up on its own, no interim ever
    const stt = createSttPort({ Recognition: FakeRecognition, pauseResetMs: 30 });
    expect(await stt.listenOnce()).toEqual({ error: 'no-speech' });
  });

  test('REQ-SPCH-003: permission errors map to not-allowed (both raw forms)', async () => {
    expect(mapSttError('not-allowed')).toBe('not-allowed');
    expect(mapSttError('service-not-allowed')).toBe('not-allowed');
    const { FakeRecognition, script } = makeFakeRecognition();
    script.push([{ type: 'error', error: 'service-not-allowed' }]);
    const stt = createSttPort({ Recognition: FakeRecognition });
    expect(await stt.listenOnce()).toEqual({ error: 'not-allowed' });
  });

  test('REQ-SPCH-004: error taxonomy — network, audio-capture, unknown→other, end-without-result→no-speech', async () => {
    expect(mapSttError('network')).toBe('network');
    expect(mapSttError('audio-capture')).toBe('audio-capture');
    expect(mapSttError('language-not-supported')).toBe('other');
    const { FakeRecognition, script } = makeFakeRecognition();
    script.push([{ type: 'end' }]); // silence: cycle ends with no result
    const stt = createSttPort({ Recognition: FakeRecognition });
    expect(await stt.listenOnce()).toEqual({ error: 'no-speech' });
  });

  test('stop() aborts the in-flight cycle as aborted (machine ignores it)', async () => {
    const { FakeRecognition, script } = makeFakeRecognition();
    script.push([]); // never emits on its own
    const stt = createSttPort({ Recognition: FakeRecognition });
    const pending = stt.listenOnce();
    stt.stop();
    expect(await pending).toEqual({ error: 'aborted' });
  });

  test('missing Recognition (unsupported browser) degrades to an explicit error', async () => {
    const stt = createSttPort({ Recognition: undefined });
    expect(stt.available).toBe(false);
    expect(await stt.listenOnce()).toEqual({ error: 'other' });
  });

  class FakePhrase {
    constructor(phrase, boost) { this.phrase = phrase; this.boost = boost; }
  }

  test('REQ-SPCH-011: on-device available → processLocally set and phrases pushed', async () => {
    const { FakeRecognition, instances, script } = makeFakeRecognition();
    script.push([{ type: 'result', alternatives: [alt('next', 0.9)] }]);
    const stt = createSttPort({
      Recognition: FakeRecognition, Phrase: FakePhrase, availableOnDevice: async () => 'available',
    });
    const result = await stt.listenOnce({ phrases: [{ phrase: 'next', boost: 3 }, { phrase: '12 across', boost: 5 }] });
    expect(result.alternatives.map((a) => a.transcript)).toEqual(['next']); // transcript path unchanged
    const rec = instances[0];
    expect(rec.processLocally).toBe(true);
    expect(rec.phrases.map((p) => [p.phrase, p.boost])).toEqual([['next', 3], ['12 across', 5]]);
  });

  test('REQ-SPCH-011: on-device unavailable → phrases ignored, un-biased path unchanged', async () => {
    const { FakeRecognition, instances, script } = makeFakeRecognition();
    script.push([{ type: 'result', alternatives: [alt('next', 0.9)] }]);
    const stt = createSttPort({
      Recognition: FakeRecognition, Phrase: FakePhrase, availableOnDevice: async () => 'unavailable',
    });
    const result = await stt.listenOnce({ phrases: [{ phrase: 'next', boost: 3 }] });
    expect(result.alternatives.map((a) => a.transcript)).toEqual(['next']);
    expect(instances[0].processLocally).toBeUndefined();
    expect(instances[0].phrases).toEqual([]);
  });

  test('REQ-SPCH-011: no phrases API in the browser → phrases silently ignored', async () => {
    const { FakeRecognition, instances, script } = makeFakeRecognition();
    script.push([{ type: 'result', alternatives: [alt('next', 0.9)] }]);
    const stt = createSttPort({ Recognition: FakeRecognition }); // no Phrase / availableOnDevice injected
    const result = await stt.listenOnce({ phrases: [{ phrase: 'next', boost: 3 }] });
    expect(result.alternatives.map((a) => a.transcript)).toEqual(['next']);
    expect(instances[0].processLocally).toBeUndefined();
    expect(instances[0].phrases).toEqual([]);
  });
});

// ---- Mic permission preflight + audio-processing constraints -------------------

describe('stt port — mic permission preflight (REQ-SPCH-003/005)', () => {
  // A track that reports back which processing actually engaged on the device.
  const fakeStream = (settings = {}) => {
    const track = { getSettings: () => settings, stop: vi.fn() };
    return { getAudioTracks: () => [track], getTracks: () => [track], _track: track };
  };

  test('REQ-SPCH-003/005: preflight requests echoCancellation, noiseSuppression, autoGainControl', async () => {
    // The whole point of the exercise: the one capture we own asks the browser to fight
    // self-echo at the source, not just default audio.
    expect(AUDIO_CONSTRAINTS).toMatchObject({
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    });
    const requested = [];
    const stream = fakeStream({ echoCancellation: true, noiseSuppression: true, autoGainControl: true });
    const nav = {
      mediaDevices: {
        getUserMedia: (c) => { requested.push(c); return Promise.resolve(stream); },
        getSupportedConstraints: () => ({ echoCancellation: true, noiseSuppression: true, autoGainControl: true }),
      },
    };
    const stt = createSttPort({ Recognition: undefined });
    expect(await stt.ensureMicPermission({ nav, log: { info() {} } }))
      .toEqual({ status: 'granted', echoCancellation: true });
    expect(requested).toEqual([{ audio: AUDIO_CONSTRAINTS }]);
    expect(stream._track.stop).toHaveBeenCalled(); // preflight releases the device
  });

  test('REQ-SPCH-003: a browser that balks at the constraint shape retries bare, still granted', async () => {
    const requested = [];
    const stream = fakeStream({});
    const nav = {
      mediaDevices: {
        getUserMedia: (c) => {
          requested.push(c);
          // First (constrained) call is rejected as if the shape were unsupported.
          return requested.length === 1 ? Promise.reject(new Error('OverconstrainedError')) : Promise.resolve(stream);
        },
      },
    };
    const stt = createSttPort({ Recognition: undefined });
    expect((await stt.ensureMicPermission({ nav, log: { info() {} } })).status).toBe('granted');
    expect(requested).toEqual([{ audio: AUDIO_CONSTRAINTS }, { audio: true }]);
  });

  test('REQ-SPCH-003: a genuine denial (both attempts fail) maps to denied', async () => {
    const nav = {
      mediaDevices: { getUserMedia: () => Promise.reject(new Error('NotAllowedError')) },
    };
    const stt = createSttPort({ Recognition: undefined });
    expect(await stt.ensureMicPermission({ nav, log: { info() {} } }))
      .toEqual({ status: 'denied', echoCancellation: null });
  });

  test('REQ-SPCH-003/REQ-DIAG-002: an already-granted permission still warms the device and reads AEC', async () => {
    // Without the warm-up, the device is only warmed (and echo-cancellation engagement
    // only known for the session log) on the very first grant.
    const requested = [];
    const stream = fakeStream({ echoCancellation: true });
    const nav = {
      permissions: { query: () => Promise.resolve({ state: 'granted' }) },
      mediaDevices: { getUserMedia: (c) => { requested.push(c); return Promise.resolve(stream); } },
    };
    const stt = createSttPort({ Recognition: undefined });
    expect(await stt.ensureMicPermission({ nav, log: { info() {} } }))
      .toEqual({ status: 'granted', echoCancellation: true });
    expect(requested).toEqual([{ audio: AUDIO_CONSTRAINTS }]);
    expect(stream._track.stop).toHaveBeenCalled();
  });

  test('REQ-SPCH-003: a denied permission state short-circuits before any capture', async () => {
    const getUserMedia = vi.fn();
    const nav = {
      permissions: { query: () => Promise.resolve({ state: 'denied' }) },
      mediaDevices: { getUserMedia },
    };
    const stt = createSttPort({ Recognition: undefined });
    expect(await stt.ensureMicPermission({ nav }))
      .toEqual({ status: 'denied', echoCancellation: null });
    expect(getUserMedia).not.toHaveBeenCalled();
  });

  test('REQ-SPCH-005/007: logs whether echo cancellation actually engaged (diagnostic, never throws)', async () => {
    const lines = [];
    const stream = fakeStream({ echoCancellation: false, noiseSuppression: true, autoGainControl: true });
    const nav = {
      mediaDevices: {
        getUserMedia: () => Promise.resolve(stream),
        getSupportedConstraints: () => ({ echoCancellation: true }),
      },
    };
    const stt = createSttPort({ Recognition: undefined });
    const result = await stt.ensureMicPermission({ nav, log: { info: (m) => lines.push(m) } });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('echoCancellation=false'); // surfaces a device with AEC off
    expect(result.echoCancellation).toBe(false); // …and the session log gets the same fact
    // A log sink that throws must not break the (already-granted) preflight — and the
    // warm-up capture is still released (the `finally`), never left holding the mic open.
    const stream2 = fakeStream({});
    const nav2 = { mediaDevices: { getUserMedia: () => Promise.resolve(stream2) } };
    const boom = { info() { throw new Error('console gone'); } };
    expect((await stt.ensureMicPermission({ nav: nav2, log: boom })).status).toBe('granted');
    expect(stream2._track.stop).toHaveBeenCalled();
  });

  test('REQ-SPCH-003: no mediaDevices at all (headless) maps to denied without throwing', async () => {
    const stt = createSttPort({ Recognition: undefined });
    expect((await stt.ensureMicPermission({ nav: {} })).status).toBe('denied');
  });
});

// ---- On-device availability probe, surfaced for the session log ------------------

describe('stt port — biasingAvailable (REQ-SPCH-011/REQ-DIAG-002)', () => {
  class FakePhrase {}

  test('reports true when the on-device path is available, probing at most once', async () => {
    const available = vi.fn(async () => 'available');
    const stt = createSttPort({ Recognition: function R() {}, Phrase: FakePhrase, availableOnDevice: available });
    expect(await stt.biasingAvailable()).toBe(true);
    expect(await stt.biasingAvailable()).toBe(true);
    expect(available).toHaveBeenCalledTimes(1); // memoized — never re-probed
  });

  test('reports false when the phrases API or the on-device model is missing', async () => {
    const noApi = createSttPort({ Recognition: function R() {}, Phrase: undefined, availableOnDevice: undefined });
    expect(await noApi.biasingAvailable()).toBe(false);
    const noModel = createSttPort({
      Recognition: function R() {},
      Phrase: FakePhrase,
      availableOnDevice: async () => 'downloadable', // only 'available' counts — no downloads
    });
    expect(await noModel.biasingAvailable()).toBe(false);
  });
});
