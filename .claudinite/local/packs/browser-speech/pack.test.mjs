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
    expect(found[0].what).toContain('onerror');
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
    expect(found[0].what).toContain('onend');
    expect(found[0].what).toContain('onerror');
  });

  test('fires when only onend is missing', () => {
    const found = run(sttTerminalHandlers, {
      'extension/src/speech/half-stt.js': `
        rec.onresult = (event) => settle(event);
        rec.onerror = (event) => settle({ error: event.error });
      `,
    });
    expect(found).toHaveLength(1);
    expect(found[0].what).toContain('onend');
    expect(found[0].what).not.toContain('onerror');
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

  for (const rule of pack.rules) {
    test(`${rule.id} is clean on extension/src`, () => {
      expect(rule.run(ctx)).toEqual([]);
    });
  }
});
