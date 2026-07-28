// Red-first fixtures for the browser-speech pack's checks.
//
// Every rule is exercised three ways: it must FIRE on a violating source, stay
// QUIET on a clean one, and stay quiet on the repo's real extension/src/ tree.
// The third case is what makes the pack shippable — a check that only ever saw
// its own fixtures is a check nobody has confronted with real code.
//
// Runs in the project's own vitest (see the .claudinite/local/packs include in
// vitest.config.js) and imports nothing from the gitignored canon mount, so it
// works in CI exactly as it does locally.

import { describe, test, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

import pack from './pack.mjs';
import { isSource } from './lib.mjs';
import ttsSpeakSettles from './tts-speak-settles.mjs';
import sttTerminalHandlers from './stt-terminal-handlers.mjs';
import micCaptureReleased from './mic-capture-released.mjs';

// A check context over a literal file map — the same {files, read} surface the
// engine's runner passes, with nothing else the rules are allowed to touch.
const ctxOf = (files) => ({
  files: Object.keys(files),
  read: (f) => (f in files ? files[f] : null),
});

const run = (rule, files) => rule.run(ctxOf(files));

describe('browser-speech pack manifest', () => {
  test('is a hand-declared local pack whose rules are all wired', () => {
    expect(pack.id).toBe('browser-speech'); // must equal the directory name
    expect(pack.detect).toBeNull();
    expect(pack.marker).toBeNull();
    expect(pack.prose).toBe('RULES.md');
    expect(pack.rules.map((r) => r.id).sort()).toEqual(
      ['mic-capture-released', 'stt-terminal-handlers', 'tts-speak-settles'],
    );
  });
});

// The scan must be repo-shape agnostic: a rule that only ever looks under one
// project's source root matches nothing — and passes vacuously green — in a repo
// laid out differently, which is exactly the bug these cases exist to prevent.
describe('source scope', () => {
  test('accepts browser source under any layout, in JS and TS alike', () => {
    for (const file of [
      'extension/src/speech/stt-port.js',
      'src/speech.ts',
      'app/lib/voice.tsx',
      'packages/web/audio.mjs',
      'assistant.cjs',
      'client/jsx/mic.jsx',
    ]) expect(isSource(file), file).toBe(true);
  });

  test('rejects test scaffolding, fixtures and vendored code wherever they sit', () => {
    for (const file of [
      'extension-test/unit/speech-ports.test.js',
      'src/speech.spec.ts',
      'test/voice.js',
      '__tests__/mic.js',
      'src/__mocks__/recognition.js',
      'test/fixtures/fake-recognizer.js',
      'node_modules/some-pkg/speech.js',
      'dist/bundle.js',
      'README.md',
    ]) expect(isSource(file), file).toBe(false);
  });
});

describe('tts-speak-settles', () => {
  test('fires when a chrome.tts handler only resolves on end', () => {
    const found = run(ttsSpeakSettles, {
      'extension/src/speech/bad-tts.js': `
        export function speak(text) {
          return new Promise((resolve) => {
            chrome.tts.speak(text, {
              enqueue: false,
              onEvent(event) {
                if (event.type === 'end') resolve();
              },
            });
          });
        }
      `,
    });
    expect(found).toHaveLength(1);
    expect(found[0].rule).toBe('tts-speak-settles');
    expect(found[0].severity).toBe('blocking');
    expect(found[0].what).toContain('interrupted');
  });

  test('fires when a SpeechSynthesisUtterance has onend but no onerror', () => {
    const found = run(ttsSpeakSettles, {
      'extension/src/speech/bad-synth.js': `
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.onend = () => resolve();
        synth.speak(utterance);
      `,
    });
    expect(found).toHaveLength(1);
    expect(found[0].what).toContain('error');
  });

  test('fires on an utterance wired for end via addEventListener but not error', () => {
    const found = run(ttsSpeakSettles, {
      'src/voice.ts': `
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.addEventListener('end', () => resolve());
        synth.speak(utterance);
      `,
    });
    expect(found).toHaveLength(1);
    expect(found[0].what).toContain('error');
  });

  test('stays quiet on an utterance that mixes the two wiring forms', () => {
    // `.onend =` beside addEventListener('error') is correctly wired; a matcher
    // that understood only property assignment would false-alarm here.
    expect(run(ttsSpeakSettles, {
      'src/voice.ts': `
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.onend = () => resolve();
        utterance.addEventListener('error', () => resolve());
      `,
    })).toEqual([]);
  });

  test('stays quiet on a handler that delegates to a hoisted terminal set', () => {
    // It enumerates nothing inline, so the rule cannot read it — and says
    // nothing rather than guessing. This code is correct; firing would be noise.
    expect(run(ttsSpeakSettles, {
      'src/tts.js': `
        const TERMINAL = new Set(['end', 'interrupted', 'cancelled', 'error']);
        function isDone(type) { return TERMINAL.has(type); }
        chrome.tts.speak(text, {
          onEvent(event) { if (isDone(event.type)) resolve(); },
        });
      `,
    })).toEqual([]);
  });

  test('stays quiet on a handler that covers every terminal event', () => {
    expect(run(ttsSpeakSettles, {
      'extension/src/speech/good-tts.js': `
        chrome.tts.speak(text, {
          enqueue: false,
          onEvent(event) {
            if (['end', 'interrupted', 'cancelled', 'error'].includes(event.type)) resolve();
          },
        });
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.onend = () => resolve();
        utterance.onerror = () => resolve();
      `,
    })).toEqual([]);
  });

  test('stays quiet on a speak() call that supplies no onEvent handler', () => {
    // The orchestrator's own tts.speak(text, {rate}) goes through the port, which
    // already owns the terminal handling — holding it to this rule would be noise.
    expect(run(ttsSpeakSettles, {
      'extension/src/app/orchestrator.js': "await tts.speak(phrases.render(a.say), { rate });",
    })).toEqual([]);
  });

  test('stays quiet when the only mention of the trap is a comment', () => {
    expect(run(ttsSpeakSettles, {
      'extension/src/speech/note.js': `
        // chrome.tts.speak(text, { onEvent(e) { if (e.type === 'end') resolve(); } })
        export const NOTE = 1;
      `,
    })).toEqual([]);
  });
});

describe('stt-terminal-handlers', () => {
  test('fires on a recognizer wired for onresult alone', () => {
    const found = run(sttTerminalHandlers, {
      'extension/src/speech/bad-stt.js': `
        const rec = new Recognition();
        rec.onresult = (event) => resolve(event.results);
        rec.start();
      `,
    });
    expect(found).toHaveLength(1);
    expect(found[0].what).toContain('end');
    expect(found[0].what).toContain('error');
  });

  test('fires when only onend is missing', () => {
    const found = run(sttTerminalHandlers, {
      'extension/src/speech/half-stt.js': `
        rec.onresult = (event) => settle(event);
        rec.onerror = (event) => settle({ error: event.error });
      `,
    });
    expect(found).toHaveLength(1);
    expect(found[0].what).toContain('end');
    expect(found[0].what).not.toContain('error');
  });

  test('stays quiet when all three handlers are wired', () => {
    expect(run(sttTerminalHandlers, {
      'extension/src/speech/good-stt.js': `
        rec.onresult = (event) => settle(event);
        rec.onerror = (event) => settle({ error: mapSttError(event?.error) });
        rec.onend = () => settle({ error: 'no-speech' });
      `,
    })).toEqual([]);
  });

  test('fires on an addEventListener-wired recognizer missing end', () => {
    // The rule used to hinge entirely on `.onresult =`, so a recognizer wired
    // the other legal way was not judged at all — it passed silently.
    const found = run(sttTerminalHandlers, {
      'src/listen.ts': `
        const rec = new webkitSpeechRecognition();
        rec.addEventListener('result', (event) => settle(event));
        rec.addEventListener('error', (event) => settle({ error: event.error }));
        rec.start();
      `,
    });
    expect(found).toHaveLength(1);
    expect(found[0].what).toContain('end');
  });

  test('stays quiet on a recognizer that mixes the two wiring forms', () => {
    expect(run(sttTerminalHandlers, {
      'src/listen.ts': `
        rec.onresult = (event) => settle(event);
        rec.addEventListener('error', (event) => settle({ error: event.error }));
        rec.addEventListener('end', () => settle({ error: 'no-speech' }));
      `,
    })).toEqual([]);
  });
});

describe('mic-capture-released', () => {
  test('fires on a capture that is never released', () => {
    const found = run(micCaptureReleased, {
      'extension/src/speech/bad-mic.js': `
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        return { status: 'granted' };
      `,
    });
    expect(found).toHaveLength(1);
    expect(found[0].fix).toContain('finally');
  });

  test('stays quiet when the tracks are stopped', () => {
    expect(run(micCaptureReleased, {
      'extension/src/speech/good-mic.js': `
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        try {
          return { status: 'granted' };
        } finally {
          stream.getTracks().forEach((t) => t.stop());
        }
      `,
    })).toEqual([]);
  });

  test('stays quiet on a bare property reference, which opens nothing', () => {
    expect(run(micCaptureReleased, {
      'extension/src/speech/probe.js': "if (!nav?.mediaDevices?.getUserMedia) return null;",
    })).toEqual([]);
  });

  test('fires on a leaked capture in a TypeScript app under a plain src/', () => {
    const found = run(micCaptureReleased, {
      'src/audio/preflight.ts': `
        const stream: MediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        return { status: 'granted' };
      `,
    });
    expect(found).toHaveLength(1);
    expect(found[0].file).toBe('src/audio/preflight.ts');
  });
});

describe('against the real extension source', () => {
  const root = process.cwd();

  function sourceFiles(dir, out = []) {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) sourceFiles(p, out);
      else if (/\.(js|mjs)$/.test(name)) out.push(relative(root, p).split(sep).join('/'));
    }
    return out;
  }

  const ctx = {
    files: sourceFiles(join(root, 'extension/src')),
    read: (f) => readFileSync(join(root, f), 'utf8'),
  };

  test('the shipped source has files for every rule to look at', () => {
    expect(ctx.files.length).toBeGreaterThan(0);
    expect(ctx.files).toContain('extension/src/speech/stt-port.js');
    expect(ctx.files).toContain('extension/src/speech/tts-port.js');
  });

  test('the real speech ports are in scope, so "clean" below means something', () => {
    // Without this, every assertion under it would still pass if the scan had
    // quietly stopped matching this repo's files — the vacuous green a
    // hard-coded source root produces in any repo but its own.
    expect(ctx.files.filter(isSource)).toEqual(
      expect.arrayContaining([
        'extension/src/speech/stt-port.js',
        'extension/src/speech/tts-port.js',
      ]),
    );
  });

  for (const rule of pack.rules) {
    test(`${rule.id} is clean on extension/src`, () => {
      expect(rule.run(ctx)).toEqual([]);
    });
  }
});
