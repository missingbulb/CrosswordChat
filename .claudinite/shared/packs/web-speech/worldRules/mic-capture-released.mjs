import { finding } from '../../../engine/checks/helpers/findings.mjs';
import { stripComments } from '../../../engine/checks/helpers/code-scanning.mjs';
import { isSource, lineOf } from '../lib.mjs';

// A getUserMedia stream is only released when its TRACKS are stopped. Dropping
// the reference, closing an AudioContext, unsetting a srcObject, or letting the
// function return does not free the device: the browser's recording indicator
// and the OS microphone indicator both stay lit, and on some platforms the
// device stays claimed until the tab closes. On anything voice-driven that is
// the most alarming possible bug — the app looks like it is listening to the
// user when it isn't.
//
// The release belongs in a `finally`, so that no early return, rejection, or
// throw between opening the capture and finishing with it can leave the device
// held — a permission preflight that opens a stream just to learn whether it is
// allowed is the classic instance, since everything it does in between can throw.
//
// Deliberately file-scoped rather than flow-scoped: proving a particular stream
// is stopped needs real data-flow analysis, and a check that guesses is worse
// than one that asks a simple, honest question — "this file opens a capture;
// does it anywhere stop the tracks?". A property reference
// (`if (!media?.getUserMedia)`) is not a call and does not trigger it; comments
// are stripped first.

const CALL = /\bgetUserMedia\s*\(/g;
const RELEASE = /\bgetTracks\b|\bgetAudioTracks\b/;
const STOP = /\.\s*stop\s*\(/;

const rule = {
  id: 'mic-capture-released',
  severity: 'blocking',
  description: 'A file that opens a getUserMedia capture also stops its tracks',
  doc: 'packs/web-speech/RULES.md',
  why: 'a media stream is freed only by stopping its tracks — dropping the reference leaves the browser and OS microphone indicators lit and the device claimed, which on anything voice-driven reads to the user as "it is still listening to me"',

  run(ctx) {
    const out = [];
    for (const file of ctx.files) {
      if (!isSource(file)) continue;
      const raw = ctx.read(file);
      if (raw === null || !raw.includes('getUserMedia')) continue;
      const src = stripComments(raw);
      CALL.lastIndex = 0;
      const first = CALL.exec(src);
      if (!first) continue;
      if (RELEASE.test(src) && STOP.test(src)) continue;
      out.push(finding(rule, {
        file,
        line: lineOf(src, first.index),
        what: 'opens a microphone capture but never stops its tracks',
        fix: 'release the capture with stream.getTracks().forEach((t) => t.stop()), and put that call in a `finally` so no early return, rejection, or throw from the code in between can leave the device held',
      }));
    }
    return out;
  },
};

export default rule;
