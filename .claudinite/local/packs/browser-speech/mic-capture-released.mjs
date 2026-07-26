import { finding, stripComments, isSource, lineOf } from './lib.mjs';

// A getUserMedia stream is only released when its TRACKS are stopped. Dropping
// the reference, closing an AudioContext, or letting the function return does
// not free the device: the browser's recording indicator and the OS mic
// indicator both stay lit, and on some platforms the device stays claimed until
// the tab is closed. For a voice product that is the single most alarming
// possible bug — the extension looks like it is listening when it isn't.
//
// This project's one owned capture is the mic-permission preflight in
// extension/src/speech/stt-port.js (REQ-SPCH-003), and its release deliberately
// sits in a `finally` so no early return and no throw from the diagnostics above
// it can leave the mic held. Issue #63 is the live check for exactly this class
// of leak on the teardown paths a unit test can't reach — which is why the
// static half is worth pinning here: a new capture added anywhere in the source
// without a matching stop is caught before it ever reaches a browser.
//
// Deliberately file-scoped rather than flow-scoped: proving a particular stream
// is stopped needs real data flow, and a check that guesses is worse than one
// that asks a simple, honest question — "this file opens a capture; does it
// anywhere stop the tracks?". A property reference (`if (!media?.getUserMedia)`)
// is not a call and does not trigger it; comments are stripped first.

const CALL = /\bgetUserMedia\s*\(/g;
const RELEASE = /\bgetTracks\b|\bgetAudioTracks\b/;
const STOP = /\.\s*stop\s*\(/;

const rule = {
  id: 'mic-capture-released',
  severity: 'blocking',
  description: 'A file that opens a getUserMedia capture also stops its tracks',
  doc: '.claudinite/local/packs/browser-speech/RULES.md',
  why: 'a media stream is freed only by stopping its tracks — dropping the reference leaves the browser and OS microphone indicators lit and the device claimed, which on a voice product reads to the user as "it is still listening to me"',

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
