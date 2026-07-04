import { describe, test, expect, vi } from 'vitest';
import { createTtsPort } from '../../extension/src/speech/tts-port.js';
import { createRemoteTtsPort } from '../../extension/src/speech/remote-tts-port.js';
import { createSttPort, mapSttError, DEFAULT_LANG } from '../../extension/src/speech/stt-port.js';
import { MSG } from '../../extension/src/shared/messages.js';

// ---- fakes -------------------------------------------------------------------

function makeFakeRecognition() {
  const instances = [];
  const script = []; // per-instance event lists
  class FakeRecognition {
    constructor() {
      instances.push(this);
    }

    start() {
      const events = script.shift() ?? [{ type: 'end' }];
      queueMicrotask(() => {
        for (const e of events) {
          if (e.type === 'result') this.onresult?.({ results: [e.alternatives] });
          else if (e.type === 'error') this.onerror?.({ error: e.error });
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

  test('REQ-SPCH-001: speaks with the first installed preferred voice', async () => {
    const voicesUsed = [];
    const chromeTts = {
      getVoices: () => Promise.resolve([
        { voiceName: 'Robotic System Default' },
        { voiceName: 'Google US English' },
      ]),
      speak: (text, opts) => {
        voicesUsed.push(opts.voiceName);
        opts.onEvent({ type: 'end' });
      },
    };
    const tts = createTtsPort({ chromeTts, synth: undefined });
    await tts.speak('one');
    await tts.speak('two');
    expect(voicesUsed).toEqual(['Google US English', 'Google US English']);
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

  test('REQ-SPCH-002/REQ-NFR-005: recognizer configured en-US, ≥3 alternatives, no interim results', async () => {
    const { FakeRecognition, instances, script } = makeFakeRecognition();
    script.push([{ type: 'result', alternatives: [alt('hi', 1)] }]);
    const stt = createSttPort({ Recognition: FakeRecognition });
    await stt.listenOnce();
    const rec = instances[0];
    expect(rec.lang).toBe(DEFAULT_LANG);
    expect(rec.lang).toBe('en-US');
    expect(rec.maxAlternatives).toBeGreaterThanOrEqual(3);
    expect(rec.interimResults).toBe(false);
    expect(rec.continuous).toBe(false);
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
});
