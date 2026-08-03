import { finding, stripComments, isSource, lineOf, wires } from './lib.mjs';

// Turning `interimResults` on changes what a `result` event MEANS. With it off,
// every result the engine delivers is a decision; with it on, most of them are
// hypotheses the engine is still revising — same event, same `event.results`
// shape, and nothing in the payload says which kind arrived except `isFinal`.
//
// So a handler that reads `event.results` without consulting `isFinal` cannot
// tell a guess from an answer, and hands its caller both. That is this pack's
// silent-failure shape again: nothing throws, the transcript looks plausible,
// and the damage shows up one layer out as a command acted on twice — the
// hypothesis, then the final that revised it ("heart" then "heart heart"), or a
// half-heard prefix acted on before the user finished the word.
//
// WHAT THE RULE ASSERTS is only the distinction, not what you do with it: an app
// is free to render interim text live, discard it, or use it purely as a
// "still speaking" signal for a pause monitor. All three need to know which
// results are final; none of them can be written without `isFinal`.
//
// THE TRIGGER IS BOTH HALVES IN ONE FILE. The rule fires only where the file
// that turns interim results on is also the file that wires `result` — that is
// the handler the setting changed the meaning of, and it is the ordinary shape
// (a recognizer is configured and wired in the same breath). A file that enables
// the setting and hands the recognizer elsewhere is judged by nobody here on
// purpose: the handler it would have to read is in another file, and a check
// that guessed at it would false-alarm on correct code.
//
// `interimResults = false` is not "enabled" — an explicit disable is the very
// thing that keeps every result final, and firing on it would be backwards.
// Both DOM wiring forms count (see `wires`), and both spellings of the finality
// flag are accepted: `isFinal` is the current spec, `.final` the legacy name
// still found in older recognizers. Comments are stripped first, so the
// paragraphs above cannot fire the rule.

// `interimResults` being SET — the property assignment (`rec.interimResults =`)
// and the options-bag / destructured-default forms (`{ interimResults: … }`,
// `{ interimResults = … }`). The lookarounds keep a comparison (`===`, `!==`)
// from reading as an assignment; a bare read (`if (rec.interimResults)`) matches
// nothing at all, since it sets no value to judge.
const SETTING = /\binterimResults\s*(?::|(?<![=!<>])=(?!=))\s*([^,;)\n}]*)/g;
const OFF = /^(?:false|0)\b/;
const FINALITY = /\bisFinal\b|\.\s*final\b/;

const rule = {
  id: 'stt-interim-results-gated',
  severity: 'blocking',
  description: 'A recognizer that enables interim results tells them apart from finals',
  doc: '.claudinite/local/packs/browser-speech/RULES.md',
  why: 'with interimResults on, most result events carry a hypothesis the engine is still revising and nothing but isFinal distinguishes one from a decision — so a handler that ignores the flag delivers guesses to its caller as answers, and the same utterance gets acted on twice',

  run(ctx) {
    const out = [];
    for (const file of ctx.files) {
      if (!isSource(file)) continue;
      const raw = ctx.read(file);
      if (raw === null || !raw.includes('interimResults')) continue;
      const src = stripComments(raw);
      if (!wires(src, 'result')) continue;
      if (FINALITY.test(src)) continue;

      let at = -1;
      SETTING.lastIndex = 0;
      for (let m = SETTING.exec(src); m; m = SETTING.exec(src)) {
        if (OFF.test(m[1].trim())) continue;
        at = m.index;
        break;
      }
      if (at === -1) continue; // every setting was an explicit disable

      out.push(finding(rule, {
        file,
        line: lineOf(src, at),
        what: 'a recognizer enables interimResults but its result handler never reads isFinal, so interim hypotheses reach the caller as finished transcripts',
        fix: 'read `isFinal` on each entry of `event.results` in the handler and act only on the final one; treat the interim arrivals as the "user is still speaking" signal — timestamp them for a pause monitor, or render them as provisional text — but never deliver them as the transcript. If interim hypotheses are not wanted at all, set `interimResults = false` and every result the engine delivers is a decision by construction',
      }));
    }
    return out;
  },
};

export default rule;
