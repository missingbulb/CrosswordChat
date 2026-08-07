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
import micConstraintsNotScreenCapture from './mic-constraints-not-screen-capture.mjs';
import sttErrorMapHasDefault from './stt-error-map-has-default.mjs';
import sttInterimResultsGated from './stt-interim-results-gated.mjs';

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
    expect(pack.worldRules.map((r) => r.id).sort()).toEqual(
      [
        'mic-capture-released',
        'mic-constraints-not-screen-capture',
        'stt-error-map-has-default',
        'stt-interim-results-gated',
        'stt-terminal-handlers',
        'tts-speak-settles',
      ],
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

describe('mic-constraints-not-screen-capture', () => {
  test('fires on a screen-capture constraint set inline on a mic capture', () => {
    const found = run(micConstraintsNotScreenCapture, {
      'extension/src/speech/echo.js': `
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, suppressLocalAudioPlayback: true },
        });
        stream.getTracks().forEach((t) => t.stop());
      `,
    });
    expect(found).toHaveLength(1);
    expect(found[0].rule).toBe('mic-constraints-not-screen-capture');
    expect(found[0].severity).toBe('blocking');
    expect(found[0].what).toContain('suppressLocalAudioPlayback');
    expect(found[0].line).toBe(3);
  });

  test('fires on restrictOwnAudio too, and reports both names', () => {
    const found = run(micConstraintsNotScreenCapture, {
      'src/audio/mic.ts': `
        await media.getUserMedia({ audio: { restrictOwnAudio: true, suppressLocalAudioPlayback: true } });
      `,
    });
    expect(found.map((f) => f.what.match(/asks for (\w+)/)[1]).sort()).toEqual(
      ['restrictOwnAudio', 'suppressLocalAudioPlayback'],
    );
  });

  test('follows one hop into a hoisted constraints constant', () => {
    // The ordinary way to write this: constraints live in a frozen constant the
    // getUserMedia call names. A rule that read only the literal argument list
    // would pass this silently — the false negative that matters most, since
    // hoisting is the shape real code takes.
    const found = run(micConstraintsNotScreenCapture, {
      'extension/src/speech/stt.js': `
        export const AUDIO_CONSTRAINTS = Object.freeze({
          echoCancellation: true,
          restrictOwnAudio: true,
        });
        const stream = await media.getUserMedia({ audio: AUDIO_CONSTRAINTS });
        stream.getTracks().forEach((t) => t.stop());
      `,
    });
    expect(found).toHaveLength(1);
    expect(found[0].what).toContain('restrictOwnAudio');
    expect(found[0].line).toBe(4);
  });

  test('stays quiet on the same constraint used on a real getDisplayMedia call', () => {
    // This is what the constraint is FOR. Grepping the file would fire here.
    expect(run(micConstraintsNotScreenCapture, {
      'src/capture/tab.ts': `
        const tab = await navigator.mediaDevices.getDisplayMedia({
          audio: { suppressLocalAudioPlayback: true, restrictOwnAudio: true },
        });
      `,
    })).toEqual([]);
  });

  test('stays quiet when a mic file merely probes the constraint is supported', () => {
    // A capability probe names the constraint without asking for it; only what
    // reaches the getUserMedia argument list is judged.
    expect(run(micConstraintsNotScreenCapture, {
      'src/audio/probe.js': `
        const supported = media.getSupportedConstraints();
        log.info('display-only', supported.suppressLocalAudioPlayback);
        const stream = await media.getUserMedia({ audio: { echoCancellation: true } });
        stream.getTracks().forEach((t) => t.stop());
      `,
    })).toEqual([]);
  });

  test('stays quiet on a clean microphone capture', () => {
    expect(run(micConstraintsNotScreenCapture, {
      'extension/src/speech/good-mic.js': `
        const AUDIO = Object.freeze({
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        });
        const stream = await media.getUserMedia({ audio: AUDIO });
        stream.getTracks().forEach((t) => t.stop());
      `,
    })).toEqual([]);
  });

  test('stays quiet when the only mention of the trap is a comment', () => {
    expect(run(micConstraintsNotScreenCapture, {
      'extension/src/speech/note.js': `
        // suppressLocalAudioPlayback and restrictOwnAudio are getDisplayMedia
        // constraints — deliberately absent from the constraints below.
        const stream = await media.getUserMedia({ audio: { echoCancellation: true } });
        stream.getTracks().forEach((t) => t.stop());
      `,
    })).toEqual([]);
  });
});

describe('stt-error-map-has-default', () => {
  test('fires on a mapping switch with no catch-all for an unknown error name', () => {
    const found = run(sttErrorMapHasDefault, {
      'extension/src/speech/bad-errors.js': `
        export function mapSttError(name) {
          switch (name) {
            case 'not-allowed':
            case 'service-not-allowed':
              return 'not-allowed';
            case 'no-speech':
              return 'no-speech';
            case 'network':
              return 'network';
          }
        }
      `,
    });
    expect(found).toHaveLength(1);
    expect(found[0].rule).toBe('stt-error-map-has-default');
    expect(found[0].severity).toBe('blocking');
    expect(found[0].what).toContain('undefined');
    expect(found[0].what).toContain('no-speech');
    expect(found[0].line).toBe(3);
  });

  test('fires in TypeScript under a plain src/ too', () => {
    const found = run(sttErrorMapHasDefault, {
      'src/voice/errors.ts': `
        function kindOf(name: string): SttKind {
          switch (name) {
            case 'aborted': return 'aborted';
            case 'audio-capture': return 'audio-capture';
          }
          log.warn('unmapped', name);
        }
      `,
    });
    expect(found).toHaveLength(1);
    expect(found[0].file).toBe('src/voice/errors.ts');
  });

  test('stays quiet when the switch has a default arm', () => {
    expect(run(sttErrorMapHasDefault, {
      'extension/src/speech/good-errors.js': `
        export function mapSttError(name) {
          switch (name) {
            case 'not-allowed':
            case 'service-not-allowed':
              return 'not-allowed';
            case 'no-speech':
              return 'no-speech';
            default:
              return 'other';
          }
        }
      `,
    })).toEqual([]);
  });

  test('stays quiet when the catch-all is a return straight after the switch', () => {
    // Exactly as total as a `default:` arm, and a common way to write it. A rule
    // that only looked for the `default` keyword would fire here — noise on
    // correct code, and the false alarm a whole-file grep makes most often.
    expect(run(sttErrorMapHasDefault, {
      'src/speech/errors.js': `
        function kindOf(name) {
          switch (name) {
            case 'no-speech': return 'no-speech';
            case 'not-allowed': return 'not-allowed';
          }
          return 'other';
        }
      `,
    })).toEqual([]);
  });

  test('does not accept a nested switch default as the outer switch\'s catch-all', () => {
    // The `default:` here belongs to the inner switch; the outer mapping is still
    // partial. A depth-blind scan for the keyword would call this file covered.
    const found = run(sttErrorMapHasDefault, {
      'src/speech/nested.js': `
        function kindOf(name, detail) {
          switch (name) {
            case 'network':
              switch (detail) {
                case 'dns': return 'network';
                default: return 'network';
              }
            case 'no-speech':
              return 'no-speech';
          }
        }
      `,
    });
    expect(found).toHaveLength(1);
    expect(found[0].what).toContain('network');
  });

  test('stays quiet on a switch that dispatches side effects rather than mapping', () => {
    // Not a taxonomy mapping: no arm returns a kind, so there is no undefined to
    // fall through to and the rule has no honest opinion about the missing arm.
    expect(run(sttErrorMapHasDefault, {
      'src/speech/report.js': `
        function report(name) {
          switch (name) {
            case 'no-speech': metrics.count('silence'); break;
            case 'not-allowed': metrics.count('denied'); break;
          }
        }
      `,
    })).toEqual([]);
  });

  test('stays quiet on a switch over one error name plus unrelated labels', () => {
    // One spec name is not a speech-error taxonomy — it is a switch that happens
    // to mention an error. Two are what identify the mapping.
    expect(run(sttErrorMapHasDefault, {
      'src/speech/state.js': `
        function next(event) {
          switch (event) {
            case 'no-speech': return 'idle';
            case 'listening': return 'live';
          }
        }
      `,
    })).toEqual([]);
  });

  test('stays quiet when the only mention of the trap is a comment', () => {
    expect(run(sttErrorMapHasDefault, {
      'src/speech/note.js': `
        // switch (name) {
        //   case 'no-speech': return 'no-speech';
        //   case 'not-allowed': return 'not-allowed';
        // }
        export const NOTE = 1;
      `,
    })).toEqual([]);
  });
});

describe('stt-interim-results-gated', () => {
  test('fires on a handler that delivers every result while interim results are on', () => {
    const found = run(sttInterimResultsGated, {
      'extension/src/speech/bad-interim.js': `
        const rec = new webkitSpeechRecognition();
        rec.interimResults = true;
        rec.onresult = (event) => {
          settle(event.results[0][0].transcript);
        };
      `,
    });
    expect(found).toHaveLength(1);
    expect(found[0].rule).toBe('stt-interim-results-gated');
    expect(found[0].severity).toBe('blocking');
    expect(found[0].what).toContain('isFinal');
    expect(found[0].line).toBe(3);
  });

  test('fires on the object-literal form, addEventListener wiring, and TypeScript alike', () => {
    const found = run(sttInterimResultsGated, {
      'src/voice/listen.ts': `
        const rec = new webkitSpeechRecognition();
        Object.assign(rec, { lang, maxAlternatives: 3, interimResults: true });
        rec.addEventListener('result', (event: SpeechRecognitionEvent) => {
          deliver(event.results[event.results.length - 1][0].transcript);
        });
      `,
    });
    expect(found).toHaveLength(1);
    expect(found[0].file).toBe('src/voice/listen.ts');
    expect(found[0].line).toBe(3);
  });

  test('fires when the flag is computed, since it cannot be shown to be off', () => {
    // `rec.interimResults = pauseMs > 0` turns interim hypotheses on for every
    // caller that asks for a pause monitor — the exact configuration whose
    // handler most needs the gate. Judging only a literal `true` would pass the
    // shape real code actually takes.
    const found = run(sttInterimResultsGated, {
      'src/speech/stt.js': `
        rec.interimResults = pauseResetMs > 0;
        rec.onresult = (event) => settle(event.results[0][0].transcript);
      `,
    });
    expect(found).toHaveLength(1);
  });

  test('stays quiet when the result handler checks isFinal', () => {
    expect(run(sttInterimResultsGated, {
      'extension/src/speech/good-interim.js': `
        rec.interimResults = true;
        rec.onresult = (event) => {
          for (const result of event.results) {
            if (!result.isFinal) { stillSpeaking(); continue; }
            settle(result[0].transcript);
          }
        };
      `,
    })).toEqual([]);
  });

  test('stays quiet when interim results are explicitly off', () => {
    // Every result the engine delivers is final, so there is nothing to gate.
    expect(run(sttInterimResultsGated, {
      'src/speech/final-only.js': `
        rec.interimResults = false;
        rec.onresult = (event) => settle(event.results[0][0].transcript);
      `,
    })).toEqual([]);
  });

  test('stays quiet on a config module that handles no results itself', () => {
    // It turns the flag on and hands the recognizer somewhere else; the gate
    // belongs in whatever file wires `result`, and this rule has no honest
    // opinion about a file it cannot see the handler in.
    expect(run(sttInterimResultsGated, {
      'src/speech/configure.js': `
        export function configure(rec, lang) {
          rec.lang = lang;
          rec.interimResults = true;
          return rec;
        }
      `,
    })).toEqual([]);
  });

  test('stays quiet when the handler is delegated out of the file', () => {
    // `rec.onresult = this.handleResult` hands the event to code the check is
    // not looking at. The gate may well be there; firing here would be alarming
    // about a file whose only sin is being one half of the story.
    expect(run(sttInterimResultsGated, {
      'src/speech/port.js': `
        rec.interimResults = true;
        rec.onresult = this.handleResult;
        rec.addEventListener('result', onResult);
      `,
    })).toEqual([]);
  });

  test('stays quiet when the only mention of the trap is a comment', () => {
    expect(run(sttInterimResultsGated, {
      'src/speech/note.js': `
        // rec.interimResults = true; — deliberately left off: nothing here
        // watches for a mid-utterance pause.
        rec.onresult = (event) => settle(event.results[0][0].transcript);
      `,
    })).toEqual([]);
  });

  test('the quiet fixtures all fire under the naive whole-file grep, which is why the parsing exists', () => {
    // The two-direction bar (README): firing fixtures prove the rule catches the
    // bug; this proves the reading of the assigned value, the inline-handler
    // gate and the comment strip are each load-bearing rather than decoration.
    const naive = (src) => /interimResults/.test(src) && !/isFinal/.test(src);
    const quiet = [
      "rec.interimResults = false;\nrec.onresult = (e) => settle(e.results[0][0].transcript);",
      'export function configure(rec) { rec.interimResults = true; return rec; }',
      'rec.interimResults = true;\nrec.onresult = this.handleResult;',
      '// rec.interimResults = true;\nrec.onresult = (e) => settle(e.results[0][0].transcript);',
    ];
    for (const src of quiet) {
      expect(naive(src), src).toBe(true);
      expect(run(sttInterimResultsGated, { 'src/speech/q.js': src }), src).toEqual([]);
    }
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

  for (const rule of pack.worldRules) {
    test(`${rule.id} is clean on extension/src`, () => {
      expect(rule.run(ctx)).toEqual([]);
    });
  }
});
