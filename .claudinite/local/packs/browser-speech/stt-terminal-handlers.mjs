import { finding, stripComments, isSource, lineOf } from './lib.mjs';

// The mirror of tts-speak-settles on the input side. A listen cycle is one
// promise the orchestrator awaits before it can dispatch HEARD or STT_ERROR
// (dev/docs/ARCHITECTURE.md §4), and webkitSpeechRecognition has three ways to
// finish a cycle — only one of which is `onresult`:
//   • onresult — the engine produced a transcript;
//   • onerror  — a taxonomy of failures (not-allowed, no-speech, network,
//                aborted, audio-capture); `aborted` in particular arrives on
//                every stop()/barge-in, i.e. constantly;
//   • onend    — the recognizer closed with NOTHING. This is the one that gets
//                forgotten, and it is routine: a silent user, an endpoint the
//                engine gave up on, an OS-level device grab. Chrome fires only
//                `end` there — no result, no error. Without an onend handler the
//                cycle never settles, the session goes deaf while still showing
//                ON, and nothing reports it.
// extension/src/speech/stt-port.js wires all three (mapping onend to
// {error:'no-speech'}); this check keeps a recognizer from being wired with less.
//
// `onresult` is a Web-Speech-only handler name, so the assignment is the whole
// trigger — no need to guess at the constructor, which this project deliberately
// injects (`Recognition = globalThis.SpeechRecognition ?? …`) for testability.
// Comments are stripped first, so a comment naming onresult can't fire the rule.

const ONRESULT = /\.\s*onresult\s*=/;
const ONEND = /\.\s*onend\s*=/;
const ONERROR = /\.\s*onerror\s*=/;

const rule = {
  id: 'stt-terminal-handlers',
  severity: 'blocking',
  description: 'A speech recognizer wires onend and onerror, not just onresult',
  doc: '.claudinite/local/packs/browser-speech/RULES.md',
  why: 'a recognition cycle that ends with no result fires only `end`, so a recognizer wired for onresult alone leaves the listen promise pending forever — the session shows ON while the mic is deaf, with no error anywhere',

  run(ctx) {
    const out = [];
    for (const file of ctx.files) {
      if (!isSource(file)) continue;
      const raw = ctx.read(file);
      if (raw === null || !raw.includes('onresult')) continue;
      const src = stripComments(raw);
      if (!ONRESULT.test(src)) continue;
      const missing = [];
      if (!ONEND.test(src)) missing.push('onend');
      if (!ONERROR.test(src)) missing.push('onerror');
      if (missing.length === 0) continue;
      out.push(finding(rule, {
        file,
        line: lineOf(src, src.search(ONRESULT)),
        what: `a speech recognizer handles onresult but never ${missing.join(' or ')}`,
        fix: `assign ${missing.join(' and ')} on the recognizer and settle the listen promise from every one of them — map onend (the "closed with nothing" case) to a no-speech outcome and onerror through a named error taxonomy, so exactly one outcome always reaches the caller`,
      }));
    }
    return out;
  },
};

export default rule;
