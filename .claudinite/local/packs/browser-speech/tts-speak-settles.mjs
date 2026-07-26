import { finding, stripComments, isSource, lineOf, balanced } from './lib.mjs';

// CrosswordChat's conversation is a strictly sequential loop: the orchestrator
// runs one machine action at a time and only dispatches TTS_DONE when the speak
// promise resolves (dev/docs/ARCHITECTURE.md §4). So a speak promise that can
// fail to settle does not "lose an utterance" — it wedges the entire session:
// no further clue is read, the mic never reopens, and nothing is thrown or
// logged. The user's only symptom is silence.
//
// Both speech engines end an utterance in more ways than "it finished":
//   • chrome.tts fires onEvent with type 'end' | 'interrupted' | 'cancelled' |
//     'error'. `interrupted` and `cancelled` are not edge cases here — the port
//     speaks with enqueue:false (so the NEXT utterance interrupts this one) and
//     barge-in / teardown call cancel() outright (REQ-LIFE-002, REQ-SPCH-009).
//     A handler that resolves only on 'end' therefore hangs on the *common* path.
//   • speechSynthesis delivers failure through `onerror`, never `onend`, so an
//     utterance wired with onend alone hangs whenever synthesis fails.
// extension/src/speech/tts-port.js gets both right; this check is what keeps a
// future edit (or a second speak site) from quietly getting them wrong.
//
// PARSED, NOT GREPPED: only the balanced argument list of a `.speak(` call is
// read, and only when that call actually supplies an `onEvent` handler — so the
// orchestrator's own `tts.speak(text, {rate})` (the port's wrapper, which already
// owns the terminal handling) stays quiet, as does any unrelated `.speak(`.
// Comments are stripped first, so the paragraph above can't fire the rule.

const TTS_TERMINAL = ['end', 'interrupted', 'cancelled', 'error'];
const SPEAK_CALL = /\.\s*speak\s*\(/g;
const UTTERANCE = /\bSpeechSynthesisUtterance\b/;
const ONEND = /\.\s*onend\s*=/;
const ONERROR = /\.\s*onerror\s*=/;

const quoted = (text, name) => new RegExp(`['"\`]${name}['"\`]`).test(text);

const rule = {
  id: 'tts-speak-settles',
  severity: 'blocking',
  description: 'A TTS completion handler settles on every terminal outcome, not just "end"',
  doc: '.claudinite/local/packs/browser-speech/RULES.md',
  why: 'the conversation loop only advances when the speak promise settles, so a handler that ignores interrupted/cancelled/error wedges the whole session in silence — with nothing thrown and nothing logged',

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
        if (missing.length === 0) continue;
        out.push(finding(rule, {
          file,
          line: lineOf(src, m.index),
          what: `a chrome.tts speak handler never settles on ${missing.join('/')}`,
          fix: `treat every terminal event as completion — resolve on ${TTS_TERMINAL.join(', ')} alike; with enqueue:false the next utterance arrives as 'interrupted' and cancel() as 'cancelled', so those are the normal endings, not the rare ones`,
        }));
      }

      // new SpeechSynthesisUtterance(text) — onend without onerror
      if (UTTERANCE.test(src) && ONEND.test(src) && !ONERROR.test(src)) {
        out.push(finding(rule, {
          file,
          line: lineOf(src, src.search(ONEND)),
          what: 'a SpeechSynthesisUtterance resolves on onend but has no onerror',
          fix: 'assign utterance.onerror alongside utterance.onend and settle the same promise from both — speechSynthesis reports a failed utterance through onerror only, so onend alone never fires and the awaiting caller hangs',
        }));
      }
    }
    return out;
  },
};

export default rule;
