import { finding, stripComments, isSource, lineOf, wires } from './lib.mjs';

// Interim results are hypotheses, not transcripts. With `interimResults` on, the
// engine streams its running guess — "hear", "heart", "heart b", "heart beat" —
// and fires `result` for every one of them. Exactly one of those events carries
// `isFinal`, and it is the only signal in the whole Web Speech API that tells a
// hypothesis apart from an utterance.
//
// A handler that reads `.transcript` without consulting `isFinal` therefore
// delivers the first partial guess as if it were what the user said, and then
// delivers the next one, and the next. That is the `"heart heart"` bug: the
// caller acts on a fragment, the user repeats themselves, and the repeat gets
// treated as more speech. Nothing throws — the transcripts are well-formed, just
// premature — which is the silent-failure shape this pack exists for.
//
// TRIGGER IS THE WHOLE FILE'S SHAPE, not a grep for one name. The rule only has
// something to say where all three halves are present:
//   • interim results are turned ON (`interimResults` assigned anything but
//     `false`, in either the property or the object-literal form);
//   • the file wires `result` (both DOM forms — see `wires`), so it is the file
//     that receives them;
//   • the file reads a `transcript`, i.e. it actually delivers text somewhere.
// A file holding only one half — a config module that flips the flag, a handler
// that never enables interims — is judged by nothing here, because the evidence
// to judge it is not in front of the check.
//
// `interimResults = false` (or an absent flag) is quiet on purpose: engines omit
// `isFinal` when interims are off, so every result is already final and gating on
// it would be noise. Comments are stripped first, so the paragraphs above cannot
// fire the rule.

// `.interimResults =` (never `==`) or the `interimResults:` object-literal key,
// capturing the value up to its natural terminator so `= false` can be excluded.
const ENABLE = /(?:\.\s*interimResults\s*=(?!=)|\binterimResults\s*:)\s*([^;,\n)}]*)/g;

const rule = {
  id: 'stt-interim-results-gated',
  severity: 'blocking',
  description: 'A recognizer that enables interim results gates its transcript on isFinal',
  doc: '.claudinite/local/packs/browser-speech/RULES.md',
  why: 'with interimResults on, the engine fires `result` for every running hypothesis and only `isFinal` tells a hypothesis from an utterance — so a handler that reads `.transcript` without it delivers the first partial guess as the user\'s words, and nothing throws because the fragment is a well-formed transcript',

  run(ctx) {
    const out = [];
    for (const file of ctx.files) {
      if (!isSource(file)) continue;
      const raw = ctx.read(file);
      if (raw === null || !raw.includes('interimResults')) continue;
      const src = stripComments(raw);
      if (!wires(src, 'result') || !/\btranscript\b/.test(src)) continue;
      if (/\bisFinal\b/.test(src)) continue;

      let at = -1;
      ENABLE.lastIndex = 0;
      for (let m = ENABLE.exec(src); m; m = ENABLE.exec(src)) {
        if (m[1].trim() === 'false') continue;
        at = m.index;
        break;
      }
      if (at === -1) continue;

      out.push(finding(rule, {
        file,
        line: lineOf(src, at),
        what: 'a recognizer enables interim results, then reads a transcript without ever consulting isFinal',
        fix: 'take the transcript only from a result whose `isFinal` is not false, and use the interim events for nothing but the "user is still speaking" timestamp a pause monitor reads — or turn `interimResults` off if this cycle has no use for them',
      }));
    }
    return out;
  },
};

export default rule;
