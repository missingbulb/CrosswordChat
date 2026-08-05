import { finding, stripComments, isSource, lineOf, wires } from './lib.mjs';

// Interim results are HYPOTHESES, not transcripts. With `interimResults` on, the
// engine emits its running guess over and over and revises it as the utterance
// forms — "heart", "heartl", "heartland" — and only the final result is the thing
// the user actually said. The one flag that tells them apart is
// `SpeechRecognitionResult.isFinal`; there is no other marker in the API, and an
// interim result is otherwise a perfectly well-formed result object with a
// transcript and a confidence.
//
// Which is exactly why treating them alike fails silently. A handler that takes
// whatever result arrived acts on the first hypothesis: the caller is handed
// "heart" while the user is still saying "heartland", the command is dispatched
// against a half-heard phrase, and nothing throws — the code got a valid result
// and did something with it. On a voice-driven app the user's only evidence is
// that it answered the wrong question, or answered twice.
//
// Interim hypotheses have exactly one honest use above the recognizer: the "the
// user is still speaking" signal a pause monitor watches to notice the endpoint
// Chrome missed. They are never delivered to the caller as a transcript.
//
// The check asks one simple, honest question, in the file-scoped style of
// `mic-capture-released`: this file turns interim hypotheses ON and handles the
// `result` event — does it anywhere distinguish a final result from an interim
// one? Both halves are required before it judges anything. A settings module that
// only sets the flag has no handler to gate and is left alone; a recognizer that
// never asked for interim results gets no finals-vs-interim problem to solve, and
// engines omit `isFinal` entirely in that mode, so demanding it there is noise.
//
// Note the gate that is CORRECT is `isFinal !== false`, not `isFinal === true`:
// an engine with interim results off may omit the flag, and a truthiness test
// would then discard every real transcript. The rule only requires that the file
// consults the flag at all — which of the two comparisons is right is a judgment
// the prose keeps.
//
// Both DOM wiring forms count (see `wires` in lib.mjs), and comments are stripped
// first, so the `rec.interimResults = true` written in the paragraphs above cannot
// fire the rule on this very file.

// An assignment (`x = v`) or an object-literal / options entry (`x: v`).
// `=(?!=)` so a comparison (`===`, `!==`) is not read as an assignment. The value
// token is then examined separately rather than with a lookahead glued to the
// `\s*` — a lookahead there backtracks the whitespace to zero width and passes on
// the very values it was meant to reject.
const SET = /\binterimResults\s*(?::|=(?!=))\s*/g;

// Value tokens that do NOT enable interim results: `false` switches them off, and
// `boolean` is a TypeScript type annotation declaring the field, not setting it.
const NOT_ENABLED = /^(?:false|boolean)\b/;

/** Index of the first assignment that turns interim results on, or -1. */
function enabledAt(src) {
  SET.lastIndex = 0;
  for (let m = SET.exec(src); m; m = SET.exec(src)) {
    if (!NOT_ENABLED.test(src.slice(m.index + m[0].length))) return m.index;
  }
  return -1;
}

const rule = {
  id: 'stt-interim-results-gated',
  severity: 'blocking',
  description: 'A recognizer that enables interim results tells them apart from finals',
  doc: '.claudinite/local/packs/browser-speech/RULES.md',
  why: 'an interim result is a revisable hypothesis that looks exactly like a transcript — same shape, same confidence, no error — so a handler that does not consult isFinal acts on "heart" while the user is still saying "heartland", dispatching a command against a half-heard phrase without anything throwing or logging',

  run(ctx) {
    const out = [];
    for (const file of ctx.files) {
      if (!isSource(file)) continue;
      const raw = ctx.read(file);
      if (raw === null || !raw.includes('interimResults')) continue;
      const src = stripComments(raw);
      const at = enabledAt(src);
      if (at === -1) continue;
      // Only a file that also consumes results has anything to gate; a settings
      // module that merely sets the flag is not this rule's business.
      if (!wires(src, 'result')) continue;
      if (/\bisFinal\b/.test(src)) continue;
      out.push(finding(rule, {
        file,
        line: lineOf(src, at),
        what: 'enables interim recognition results and handles the result event, but never reads isFinal — so a revisable hypothesis reaches the caller as if it were the transcript',
        fix: 'gate the result handler on the result\'s isFinal flag: deliver only a final result to the caller, and use the interim ones solely as the "user is still speaking" signal a pause monitor watches. Test it as `isFinal !== false`, not `=== true` — engines omit the flag when interim results are off, and a truthiness test would then drop every real transcript. If this file genuinely never needs hypotheses, set interimResults to false instead',
      }));
    }
    return out;
  },
};

export default rule;
