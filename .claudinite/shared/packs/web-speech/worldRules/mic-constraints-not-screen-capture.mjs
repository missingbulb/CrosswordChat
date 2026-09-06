import { finding } from '../../../engine/checks/helpers/findings.mjs';
import { stripComments } from '../../../engine/checks/helpers/code-scanning.mjs';
import { isSource, lineOf, balanced } from '../lib.mjs';

// `suppressLocalAudioPlayback` and `restrictOwnAudio` are `getDisplayMedia`
// SCREEN-CAPTURE constraints. They filter the playout of a captured tab out of
// that tab's audio track; they say nothing about a microphone, and getUserMedia
// ignores them entirely — no throw, no warning, no `OverconstrainedError`.
//
// They are reached for by name: someone hunting the app's own TTS leaking back
// through the mic reads "suppress local audio playback" / "restrict own audio"
// as exactly the fix, sets it on the mic capture, and ships believing self-echo
// is handled at the capture layer. It isn't, and the code that would have
// handled it (an application-level echo guard) never gets written. Speech
// failures are silent: nothing throws, nothing logs, and the feature simply
// does not exist.
//
// PARSED, NOT GREPPED. The names are only wrong where they reach a microphone
// capture, so the scan is the balanced argument list of a `getUserMedia(` call —
// plus, one hop, the initializer of any same-file constant that argument list
// references, since hoisting the constraints into a frozen constant is the
// ordinary way to write this:
//
//     const AUDIO = Object.freeze({ echoCancellation: true });
//     await media.getUserMedia({ audio: AUDIO });
//
// Everything outside that reach stays quiet on purpose — a file's real
// getDisplayMedia call, a `getSupportedConstraints()` probe, a screen-capture
// module's own constants table are all legitimate uses of these names, and a
// rule that grepped the file would false-alarm on every one of them. Comments
// are stripped first, so the paragraphs above cannot fire the rule.

const CALL = /\bgetUserMedia\s*\(/g;
const DECL = /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/g;
const OPENER = /^\s*(?:[A-Za-z_$][\w$.]*\s*)?([[{(])/;
const DISPLAY_ONLY = ['suppressLocalAudioPlayback', 'restrictOwnAudio'];

/**
 * The index ranges of `src` that a getUserMedia call's constraints actually
 * reach: the argument list itself, plus the initializer of every same-file
 * `const`/`let`/`var` the argument list names. One hop only — resolving further
 * needs real data-flow analysis, and a check that guesses is worse than one that
 * asks a simple, honest question.
 */
function reach(src, argsStart, args) {
  const regions = [{ start: argsStart, end: argsStart + args.length }];
  DECL.lastIndex = 0;
  for (let d = DECL.exec(src); d; d = DECL.exec(src)) {
    if (!new RegExp(`\\b${d[1]}\\b`).test(args)) continue;
    const eq = d.index + d[0].length;
    const head = OPENER.exec(src.slice(eq));
    if (!head) continue;
    const open = eq + head[0].length - 1;
    const init = balanced(src, open);
    if (init === null) continue;
    regions.push({ start: open, end: open + init.length });
  }
  return regions;
}

const rule = {
  id: 'mic-constraints-not-screen-capture',
  severity: 'blocking',
  description: 'A microphone capture never asks for getDisplayMedia-only constraints',
  doc: 'packs/web-speech/RULES.md',
  why: 'suppressLocalAudioPlayback and restrictOwnAudio are getDisplayMedia screen-capture constraints — they filter a captured tab\'s own playout, not a microphone — so getUserMedia silently ignores them while the author believes self-echo is now handled at the capture layer and never writes the guard that would have handled it',

  run(ctx) {
    const out = [];
    for (const file of ctx.files) {
      if (!isSource(file)) continue;
      const raw = ctx.read(file);
      if (raw === null || !DISPLAY_ONLY.some((name) => raw.includes(name))) continue;
      const src = stripComments(raw);
      const seen = new Set();
      CALL.lastIndex = 0;
      for (let m = CALL.exec(src); m; m = CALL.exec(src)) {
        const argsStart = m.index + m[0].length - 1;
        const args = balanced(src, argsStart);
        if (args === null) continue;
        for (const { start, end } of reach(src, argsStart, args)) {
          const region = src.slice(start, end);
          for (const name of DISPLAY_ONLY) {
            const at = region.search(new RegExp(`\\b${name}\\b`));
            if (at === -1) continue;
            const line = lineOf(src, start + at);
            if (seen.has(`${name}:${line}`)) continue;
            seen.add(`${name}:${line}`);
            out.push(finding(rule, {
              file,
              line,
              what: `a getUserMedia microphone capture asks for ${name}, which is a getDisplayMedia screen-capture constraint`,
              fix: `drop ${name} from the microphone constraints — it filters a captured tab's own playout out of a screen-capture track and getUserMedia ignores it outright, so it suppresses nothing here; residual self-echo has to be handled above the capture (an application-level echo guard), because the recognizer's capture takes no constraints at all`,
            }));
          }
        }
      }
    }
    return out;
  },
};

export default rule;
