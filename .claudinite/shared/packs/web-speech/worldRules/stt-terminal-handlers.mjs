import { finding } from '../../../engine/checks/helpers/findings.mjs';
import { stripComments } from '../../../engine/checks/helpers/code-scanning.mjs';
import { isSource, lineOf, wires } from '../lib.mjs';

// The mirror of tts-speak-settles on the input side. A recognition cycle has
// three ways to finish, only one of which is `result`:
//   • result — the engine produced a transcript;
//   • error  — a named taxonomy of failures (not-allowed, no-speech, network,
//              aborted, audio-capture); `aborted` in particular arrives on every
//              stop() and every barge-in, i.e. routinely;
//   • end    — the recognizer closed with NOTHING. This is the one that gets
//              forgotten, and it is not rare: a silent user, an endpoint the
//              engine gave up on, an OS-level device grab. The browser fires
//              only `end` there — no result, no error.
//
// A recognizer wired for `result` alone therefore leaves its cycle pending on
// two of its three exits. Nothing throws and nothing logs; the UI still shows a
// live mic while the recognizer is closed and deaf, and only the user notices.
// Continuous recognizers are no exception — they need `end` to restart on and
// `error` to stop retrying on, or they die just as quietly.
//
// `onresult` / addEventListener('result') is Web-Speech-only, so the wiring is
// the whole trigger — no need to guess at the constructor, which is variously
// `SpeechRecognition`, `webkitSpeechRecognition`, or an injected seam. Both DOM
// wiring forms count (see `wires`): a file mixing `rec.onresult =` with
// `rec.addEventListener('error', …)` is correctly wired and must stay quiet.
// Comments are stripped first, so a comment naming onresult can't fire the rule.

const rule = {
  id: 'stt-terminal-handlers',
  severity: 'blocking',
  description: 'A speech recognizer handles the end and error events, not just result',
  doc: 'packs/web-speech/RULES.md',
  why: 'a recognition cycle that ends with no transcript fires only `end`, so a recognizer wired for result alone leaves the listen promise pending forever — the UI shows a live mic while nothing is listening, with no error anywhere',

  run(ctx) {
    const out = [];
    for (const file of ctx.files) {
      if (!isSource(file)) continue;
      const raw = ctx.read(file);
      if (raw === null || !raw.includes('result')) continue;
      const src = stripComments(raw);
      if (!wires(src, 'result')) continue;
      const missing = ['end', 'error'].filter((event) => !wires(src, event));
      if (missing.length === 0) continue;
      out.push(finding(rule, {
        file,
        line: lineOf(src, src.search(/\.\s*onresult\s*=|addEventListener\s*\(\s*['"`]result['"`]/)),
        what: `a speech recognizer handles result but never ${missing.join(' or ')}`,
        fix: `handle ${missing.join(' and ')} on the recognizer and settle the listen cycle from every one of them — map end (the "closed with nothing" case) to a no-speech outcome and error through a named taxonomy, so exactly one outcome always reaches the caller`,
      }));
    }
    return out;
  },
};

export default rule;
