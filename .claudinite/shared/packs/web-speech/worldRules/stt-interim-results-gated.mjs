import { finding } from '../../../engine/checks/helpers/findings.mjs';
import { stripComments } from '../../../engine/checks/helpers/code-scanning.mjs';
import { isSource, lineOf } from '../lib.mjs';

// Interim hypotheses arrive on the SAME `result` event as the finished
// utterance. Turning `interimResults` on does not open a second channel: the
// engine keeps re-firing `result` with its running guess, and the only thing
// that distinguishes a guess from a transcript is `isFinal` on the result. A
// handler that reads `event.results[i][0].transcript` and delivers it has
// therefore just handed the caller a half-heard fragment — and will hand it the
// next fragment, and the next, several times per utterance.
//
// The failure is silent in the usual way: nothing throws, nothing logs,
// and the transcript even looks plausible. The app simply acts on words the user
// had not finished saying, and repeats itself as the guess is revised — the
// `"heart heart"` shape a mid-utterance pause monitor exists to prevent. Interim
// results are a "still speaking" SIGNAL; they are not input.
//
// The rule is deliberately narrow in three ways, each killing a false alarm a
// whole-file grep for `interimResults` makes:
//
//   1. The assigned value is read. `interimResults = false` (or 0/null/undefined)
//      turns the flag OFF, every result is final, and there is nothing to gate —
//      firing there is pure noise. Anything else counts as enabling, including a
//      computed flag (`rec.interimResults = pauseResetMs > 0`), because a check
//      cannot know it is false and the handler must survive it being true.
//   2. Only a file that SPELLS OUT its result handler is judged. A config module
//      that sets the flag and hands the recognizer on, and a file that delegates
//      (`rec.onresult = this.handleResult`), both keep their gate in some other
//      file; this rule has no honest opinion about a handler it cannot see, and
//      a check that guesses is worse than one that asks a simple, honest
//      question.
//   3. Comments are stripped first, so a comment naming the trap — the
//      paragraphs above included — cannot fire the rule.
//
// `isFinal` anywhere in the file counts as the gate: it is the ONLY thing in the
// Web Speech API that distinguishes an interim result from a final one, so there
// is no second spelling to look for, and reading it at all means the distinction
// was considered.

// `x.interimResults = V` (a property assignment, not `==`/`===`) or the
// object-literal key `interimResults: V`, with V captured up to the end of the
// value — enough to tell a literal `false` from everything else.
const FLAG = /\binterimResults\s*(?:(?<![=!<>])=(?!=)|:)\s*([^,;\n)}]*)/g;
const OFF = /^(?:false|0|null|undefined)$/;

// Both legal wirings, each split at the point where the handler ARGUMENT begins.
// This rule needs the argument itself, not merely the fact of a wiring, so
// `lib.mjs`'s `wires` — which answers only "is `result` wired here?" — is not
// enough; the two forms are still both accepted, as everywhere in this pack.
const WIRES_RESULT = [
  /\.\s*onresult\s*=\s*/g,
  /addEventListener\s*\(\s*['"`]result['"`]\s*,\s*/g,
];

// A handler written out here and now: an arrow, a function expression, or an
// async one. A bare reference (`this.handleResult`, `onResult`) or a call that
// returns one (`makeHandler(deps)`) is delegation — the gate lives wherever that
// handler is defined, which is a file this check is not looking at.
const INLINE_HANDLER = /^(?:async\s+)?(?:function\b|\(|[A-Za-z_$][\w$]*\s*=>)/;

/** True when this file wires `result` to a handler it also spells out itself. */
function handlesResultInline(src) {
  for (const re of WIRES_RESULT) {
    re.lastIndex = 0;
    for (let m = re.exec(src); m; m = re.exec(src)) {
      if (INLINE_HANDLER.test(src.slice(m.index + m[0].length))) return true;
    }
  }
  return false;
}

const rule = {
  id: 'stt-interim-results-gated',
  severity: 'blocking',
  description: 'A recognizer that enables interim results gates its handler on isFinal',
  doc: 'packs/web-speech/RULES.md',
  why: 'interim hypotheses are delivered on the same result event as the final transcript, so a handler that never checks isFinal treats every half-formed guess as a finished utterance — the app acts on words the user has not said yet and repeats itself as the guess is revised, with nothing thrown and nothing logged',

  run(ctx) {
    const out = [];
    for (const file of ctx.files) {
      if (!isSource(file)) continue;
      const raw = ctx.read(file);
      if (raw === null || !raw.includes('interimResults')) continue;
      const src = stripComments(raw);
      // Handled elsewhere: the gate belongs wherever the handler is written.
      if (!handlesResultInline(src)) continue;
      if (/\bisFinal\b/.test(src)) continue;

      FLAG.lastIndex = 0;
      for (let m = FLAG.exec(src); m; m = FLAG.exec(src)) {
        if (OFF.test(m[1].trim())) continue;
        out.push(finding(rule, {
          file,
          line: lineOf(src, m.index),
          what: 'this file turns on interim results and handles the result event, but never checks isFinal',
          fix: 'test `isFinal` on each result in the handler and deliver only a final one to the caller — use the interim results solely as the "still speaking" signal (they are what a mid-utterance pause monitor watches); if interim hypotheses are not wanted at all, leave interimResults off rather than filtering them downstream',
        }));
        break; // one finding per file: the handler is the defect, not each flag
      }
    }
    return out;
  },
};

export default rule;
