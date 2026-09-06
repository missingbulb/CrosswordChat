import { finding } from '../../../engine/checks/helpers/findings.mjs';
import { stripComments } from '../../../engine/checks/helpers/code-scanning.mjs';
import { isSource, lineOf, balanced, wires, quoted } from '../lib.mjs';

// Speaking is asynchronous, and both browser TTS engines end an utterance in
// more ways than "it finished". A caller that awaits completion — anything with
// a speak promise, a queue that waits its turn, a UI that re-enables on done —
// settles only if its handler treats EVERY terminal outcome as an ending:
//
//   • chrome.tts fires onEvent with type 'end' | 'interrupted' | 'cancelled' |
//     'error'. `interrupted` arrives whenever a later speak() with enqueue:false
//     displaces this utterance, and `cancelled` whenever it is dropped from the
//     queue before it starts (a tts.stop(), a teardown, a barge-in). In any app
//     that can speak twice or stop early — which is most of them — those are
//     ordinary endings, not edge cases, so a handler resolving on 'end' alone
//     hangs on the COMMON path.
//   • speechSynthesis reports a failed utterance through `error` and never
//     through `end`, so an utterance wired for end alone hangs on every failure.
//
// The failure is silent by construction: nothing throws, nothing logs, the
// promise simply never settles. Whatever the caller was going to do next — speak
// the next item, reopen the mic, drop a spinner — never happens.
//
// PARSED, NOT GREPPED, and deliberately narrow in two ways:
//   1. Only the balanced argument list of a `.speak(` call is read, and only when
//      that call actually supplies an `onEvent` handler — so a wrapper's own
//      `tts.speak(text, {rate})` (the wrapper owns the terminal handling) and any
//      unrelated `.speak(` stay quiet.
//   2. A handler is judged only if it enumerates terminal types INLINE (it quotes
//      at least one of them). One that delegates to a hoisted set or table —
//      `if (TERMINAL.has(e.type)) resolve()` — is not something this rule can
//      read, so it says nothing rather than guessing; a check that guesses is
//      worse than one that asks a simple, honest question.
// Comments are stripped first, so the paragraphs above can't fire the rule.

const TTS_TERMINAL = ['end', 'interrupted', 'cancelled', 'error'];
const SPEAK_CALL = /\.\s*speak\s*\(/g;
const UTTERANCE = /\bSpeechSynthesisUtterance\b/;

const rule = {
  id: 'tts-speak-settles',
  severity: 'blocking',
  description: 'A TTS completion handler settles on every terminal outcome, not just "end"',
  doc: 'packs/web-speech/RULES.md',
  why: 'a speak promise settles only from the outcome its handler recognises, so one that ignores interrupted/cancelled/error leaves every awaiting caller pending forever — with nothing thrown and nothing logged',

  run(ctx) {
    const out = [];
    for (const file of ctx.files) {
      if (!isSource(file)) continue;
      const raw = ctx.read(file);
      if (raw === null) continue;
      const src = stripComments(raw);

      // chrome.tts.speak(text, { onEvent(e) { … } })
      SPEAK_CALL.lastIndex = 0;
      for (let m = SPEAK_CALL.exec(src); m; m = SPEAK_CALL.exec(src)) {
        const args = balanced(src, m.index + m[0].length - 1);
        if (args === null || !/\bonEvent\b/.test(args)) continue;
        const missing = TTS_TERMINAL.filter((type) => !quoted(args, type));
        // Enumerates none inline → it is delegating, not forgetting. Say nothing.
        if (missing.length === 0 || missing.length === TTS_TERMINAL.length) continue;
        out.push(finding(rule, {
          file,
          line: lineOf(src, m.index),
          what: `a chrome.tts speak handler never settles on ${missing.join('/')}`,
          fix: `treat every terminal event as completion — resolve on ${TTS_TERMINAL.join(', ')} alike; a later speak() with enqueue:false ends this utterance as 'interrupted' and a stop()/teardown as 'cancelled', so those are normal endings, not rare ones`,
        }));
      }

      // new SpeechSynthesisUtterance(text) — wired for end without error
      if (UTTERANCE.test(src) && wires(src, 'end') && !wires(src, 'error')) {
        out.push(finding(rule, {
          file,
          line: lineOf(src, src.search(UTTERANCE)),
          what: 'a SpeechSynthesisUtterance settles on end but has no error handler',
          fix: "handle the utterance's error event alongside end and settle the same promise from both (either wiring form — `utterance.onerror =` or `addEventListener('error', …)`) — speechSynthesis reports a failed utterance through error only, so end never fires and the awaiting caller hangs",
        }));
      }
    }
    return out;
  },
};

export default rule;
