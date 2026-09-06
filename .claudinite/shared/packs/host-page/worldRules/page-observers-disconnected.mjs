import { finding } from '../../../engine/checks/helpers/findings.mjs';
import { stripComments } from '../../../engine/checks/helpers/code-scanning.mjs';
import { isSource, lineOf } from '../lib.mjs';

// A DOM observer you start on a page you do not own runs until you disconnect it
// or the document dies — and the document of a single-page app you are a guest in
// does not die. Everything else that ends your feature (the session stopped, the
// element you were waiting for arrived, your UI unmounted) ends nothing for the
// observer: it keeps waking on every mutation the host makes, forever, holding
// its callback's whole closure alive with it.
//
// On a host page that is not merely a leak. It is the difference between "off"
// and "off but still watching": a MutationObserver left on a busy app fires
// thousands of times a minute, and any work its callback does — a snapshot, a
// diff, a re-render of your own injected UI — is work the user did not ask for
// on a page that is not yours. An extension that promises to be inert when idle
// cannot keep that promise with a live observer in the page.
//
// Deliberately file-scoped rather than flow-scoped: proving that a PARTICULAR
// observer is disconnected on every path needs real data-flow analysis, and a
// check that guesses is worse than one that asks a simple, honest question —
// "this file starts an observer on the page; does it anywhere disconnect one?".
// A file that constructs an observer but never calls `.observe(` has started
// nothing and is not asked. Comments are stripped first.

const OBSERVER = /\b(?:Mutation|Intersection|Resize)Observer\b/;
const CONSTRUCT = /\bnew\s+(?:[A-Za-z_$][\w$]*\s*\.\s*)?(?:Mutation|Intersection|Resize)Observer\s*\(/g;
const STARTED = /\.\s*observe\s*\(/;
const STOPPED = /\.\s*disconnect\s*\(/;

const rule = {
  id: 'page-observers-disconnected',
  severity: 'blocking',
  description: 'A file that starts a DOM observer also disconnects one',
  doc: 'packs/host-page/RULES.md',
  why: 'an observer on a host page outlives whatever started it — the single-page app never unloads, so "stopped" work keeps waking on every host mutation and the guest is never really inert',

  run(ctx) {
    const out = [];
    for (const file of ctx.files) {
      if (!isSource(file)) continue;
      const raw = ctx.read(file);
      if (raw === null || !OBSERVER.test(raw)) continue;
      const src = stripComments(raw);
      CONSTRUCT.lastIndex = 0;
      const first = CONSTRUCT.exec(src);
      if (!first) continue;
      if (!STARTED.test(src)) continue; // constructed but never started: watches nothing
      if (STOPPED.test(src)) continue;
      out.push(finding(rule, {
        file,
        line: lineOf(src, first.index),
        what: 'starts a DOM observer on the page but never disconnects one',
        fix: 'call observer.disconnect() on every path that ends the work it was watching for — the moment a one-shot observer sees what it was waiting for, and in the teardown of anything session-scoped',
      }));
    }
    return out;
  },
};

export default rule;
