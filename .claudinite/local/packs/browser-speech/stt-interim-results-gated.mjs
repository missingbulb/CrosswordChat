import { finding, stripComments, isSource, lineOf } from './lib.mjs';

// `interimResults = true` changes what `onresult` MEANS. With it off, the engine
// fires `result` once, at the end of the utterance, and every result is final.
// With it on, the same handler is called repeatedly mid-utterance with running
// hypotheses — `"heart"`, `"heart of"`, `"heart of the"` — and only the last one
// is the utterance. `SpeechRecognitionResult.isFinal` is the only thing that
// tells the two apart; nothing else in the event does.
//
// So a handler written for the off case and then switched on delivers the FIRST
// hypothesis as if it were the transcript. Nothing throws: the caller gets a
// plausible-looking string that is a fragment of what the user said, acts on it,
// and the real utterance is still arriving. In a voice-driven app that is a
// command executed from half a sentence — the loudest possible failure, produced
// entirely silently.
//
// Why interim results get enabled at all: Chrome's endpointing is unreliable, and
// interim hypotheses are the only "the user is still speaking" signal available
// to a pause monitor. That is a legitimate reason to turn them on — and exactly
// the path that leaves a result handler written before the switch unguarded.
//
// Scoped, not grepped, on two axes, because the naive whole-file grep
// ("interimResults appears and isFinal doesn't") is wrong twice:
//   • the assignment's VALUE is read, so `interimResults = false` — a file
//     explicitly opting out, which is the safe configuration — cannot fire;
//   • the handler must be written INLINE in this file. `rec.onresult =
//     this.handleResult` hands the event to code the check cannot see, and a
//     rule that fired there would be alarming about a file whose gating simply
//     lives elsewhere. Delegation is judged by staying quiet.
// `isFinal` anywhere in the file's code counts as gated, deliberately: an inline
// handler that calls a same-file helper to pick the final result is correct, and
// a check has no business insisting the comparison sit in the handler body.
// Comments are stripped first, so prose naming `interimResults` cannot fire it.

const INTERIM = /(?:\.\s*interimResults\s*=|\binterimResults\s*:)\s*([^,;\n)}]+)/g;

// The two legal wirings, each split at the point where the handler ARGUMENT
// begins — the rule needs the argument itself, not just the fact of the wiring,
// so `wires()` from lib.mjs is not enough here.
const WIRINGS = [
  /\.\s*onresult\s*=\s*/g,
  /addEventListener\s*\(\s*['"`]result['"`]\s*,\s*/g,
];

// A handler written out here and now: an arrow, a function expression, or an
// async one. A bare reference (`this.handleResult`, `onResult`) is delegation.
const INLINE_HANDLER = /^(?:async\s+)?(?:function\b|\(|[A-Za-z_$][\w$]*\s*=>)/;

/** Index of the first `interimResults` assignment that turns them ON, or null. */
function interimEnabledAt(src) {
  INTERIM.lastIndex = 0;
  let m;
  while ((m = INTERIM.exec(src)) !== null) {
    if (m[1].trim() !== 'false') return m.index;
  }
  return null;
}

/** True when this file wires a result handler it also spells out itself. */
function hasInlineResultHandler(src) {
  for (const re of WIRINGS) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(src)) !== null) {
      if (INLINE_HANDLER.test(src.slice(m.index + m[0].length))) return true;
    }
  }
  return false;
}

const rule = {
  id: 'stt-interim-results-gated',
  severity: 'blocking',
  description: 'A recognizer with interimResults on gates its result handler on isFinal',
  doc: '.claudinite/local/packs/browser-speech/RULES.md',
  why: 'with interimResults on, `result` fires repeatedly mid-utterance with running hypotheses, and `isFinal` is the only thing distinguishing them from the transcript — an ungated handler silently delivers a fragment of what the user said as if it were the whole thing',

  run(ctx) {
    const out = [];
    for (const file of ctx.files) {
      if (!isSource(file)) continue;
      const raw = ctx.read(file);
      if (raw === null || !raw.includes('interimResults')) continue;
      const src = stripComments(raw);
      const at = interimEnabledAt(src);
      if (at === null) continue;
      if (!hasInlineResultHandler(src)) continue; // delegated: judged elsewhere
      if (/\bisFinal\b/.test(src)) continue;
      out.push(finding(rule, {
        file,
        line: lineOf(src, at),
        what: 'this recognizer enables interimResults but its result handler never checks isFinal',
        fix: 'check `isFinal` on each result before delivering it — take the final result as the transcript, and use the interim ones only as the "still speaking" signal (a pause monitor watching for a mid-utterance stall). If interim hypotheses are not needed at all, set `interimResults = false` instead',
      }));
    }
    return out;
  },
};

export default rule;
