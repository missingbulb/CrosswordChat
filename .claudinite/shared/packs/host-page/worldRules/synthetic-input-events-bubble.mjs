import { finding } from '../../../engine/checks/helpers/findings.mjs';
import { stripComments } from '../../../engine/checks/helpers/code-scanning.mjs';
import { isSource, lineOf, balanced, inputEventCtors, eventConstructions, hasSpread } from '../lib.mjs';

// A real click or keystroke bubbles. A synthetic one only bubbles if you say so:
// `bubbles` defaults to FALSE on every DOM event constructor, so
// `el.dispatchEvent(new MouseEvent('click'))` fires an event that reaches
// listeners on `el` and stops dead there.
//
// On your own markup you rarely notice, because you attached the listener to the
// node you dispatched at. On a host page you always notice, because you never
// attached anything: the app you are driving handles input by DELEGATION, one
// listener near its own root, and an event that does not bubble never arrives.
// The failure is silent in the worst way — dispatchEvent returns true, no
// exception, no console message, and the page simply does not respond. It is
// indistinguishable from "the app ignores untrusted events", which is the wrong
// conclusion to reach and an expensive one to back out of.
//
// Scoped to the event interfaces that model REAL USER INPUT (lib.mjs
// INPUT_EVENT_CLASSES) at a `dispatchEvent` site. A CustomEvent is your own signal
// to your own listener and is legitimately non-bubbling, so it is never judged.
// The constructor is resolved through one alias hop, because a generic `fire()`
// helper — the shape an adapter that funnels ALL its synthetic input through one
// place actually has — picks its constructor by feature rather than naming a class
// at the dispatch site. And "dispatched" is resolved through one variable hop for
// the same reason: `const ev = new MouseEvent('click'); el.dispatchEvent(ev)` is
// the other shape real dispatch code takes, and an inline-only reading would look
// straight past it.
//
// An init literal that spreads something (`{ ...init }`) is beyond what this check
// can see, so it says nothing: the fields may well be set by the caller. That is
// the deliberate quiet direction — a check on a fidelity contract earns its keep
// by never crying wolf on code it cannot read.

const DISPATCH = /\.\s*dispatchEvent\s*\(/g;
const BUBBLES_TRUE = /\bbubbles\s*:\s*(?:true|!0)\b/;
const BUBBLES_ANY = /\bbubbles\s*:/;

const rule = {
  id: 'synthetic-input-events-bubble',
  severity: 'blocking',
  description: 'A dispatched user-input event sets bubbles: true',
  doc: 'packs/host-page/RULES.md',
  why: 'bubbles defaults to false on every event constructor, and a host page handles input by delegation near its own root — a non-bubbling synthetic event never reaches the handler, silently, and reads as "the app ignores untrusted events"',

  run(ctx) {
    const out = [];
    for (const file of ctx.files) {
      if (!isSource(file)) continue;
      const raw = ctx.read(file);
      if (raw === null || !raw.includes('dispatchEvent')) continue;
      const src = stripComments(raw);
      const ctors = inputEventCtors(src);

      // Where the dispatches are: the argument span of every dispatchEvent call
      // (an event constructed inline there is dispatched), plus the names of
      // locals dispatched bare — `el.dispatchEvent(ev)`.
      const spans = [];
      const idents = new Set();
      DISPATCH.lastIndex = 0;
      let call;
      while ((call = DISPATCH.exec(src))) {
        const open = DISPATCH.lastIndex - 1;
        const args = balanced(src, open);
        if (args === null) continue;
        spans.push([open, open + args.length]);
        const bare = /^\(\s*([A-Za-z_$][\w$]*)\s*\)$/.exec(args);
        if (bare) idents.add(bare[1]);
      }

      for (const { name, index, init } of eventConstructions(src, ctors)) {
        const inline = spans.some(([a, b]) => index >= a && index < b);
        if (!inline && !idents.has(assignedTo(src, index))) continue; // constructed but never dispatched: not input
        if (init === null) {
          out.push(finding(rule, {
            file,
            line: lineOf(src, index),
            what: `dispatches a ${name} constructed with no init, so it does not bubble`,
            fix: `pass { bubbles: true, cancelable: true, composed: true } to the ${name} constructor — a real user event carries all three, and a page that handles input by delegation only ever sees the ones that bubble`,
          }));
          continue;
        }
        if (BUBBLES_TRUE.test(init)) continue;
        if (hasSpread(init) && !BUBBLES_ANY.test(init)) continue; // spread may set it: unreadable, so silent
        out.push(finding(rule, {
          file,
          line: lineOf(src, index),
          what: `dispatches a ${name} that does not set bubbles: true`,
          fix: `set bubbles: true in the ${name} init — without it the event stops at the node you dispatched it on and never reaches the delegated handler the host page listens with`,
        }));
      }
    }
    return out;
  },
};

// The local a construction is assigned to (`const ev = new MouseEvent(…)` → 'ev'),
// or null. One hop, mirroring the one alias hop on the constructor side; a local
// built by a call (`const ev = makeEvent()`) constructs nothing this check can see
// and stays unjudged. A property target (`foo.bar = …`) is rejected — a bare-ident
// dispatch cannot be naming it.
function assignedTo(src, index) {
  const before = src.slice(Math.max(0, index - 80), index);
  const m = /([A-Za-z_$][\w$]*)\s*=\s*$/.exec(before);
  if (!m) return null;
  const prev = before[m.index - 1];
  return prev === '.' ? null : m[1];
}

export default rule;
