import {
  finding, stripComments, isSource, lineOf, balanced,
  inputEventCtors, eventConstructions, assignedTo,
} from './lib.mjs';

// An event only reaches a listener that sits on its target or on an ANCESTOR of
// it. A modern web app handles input by delegation — one listener near its own
// root — and that root is a DESCENDANT of `<body>`. So a synthetic keystroke or
// click dispatched at `document`, `document.body`, `document.documentElement` or
// `window` starts its journey ABOVE the app's root and bubbles further up and
// away from it: the delegated handler is never on the path, and never runs.
//
// The failure is the silent kind this pack exists for. `dispatchEvent` returns
// true, nothing throws, nothing is logged, and the page simply does not react —
// which reads as "the host ignores untrusted events", the wrong conclusion and an
// expensive one to back out of (you go off building a debugger-protocol or
// extension-API fallback for a problem that was one wrong target node).
//
// The sibling `synthetic-input-events-bubble` check judges the same dispatch from
// the other side: it asks whether the event CAN travel, this one asks whether it
// is aimed anywhere the app can hear it. Both can be satisfied and the write still
// fail, which is why they are two rules — `document.dispatchEvent(new
// KeyboardEvent('keydown', { bubbles: true }))` bubbles perfectly, past nothing.
//
// PARSED, NOT GREPPED, and quiet wherever the target is not literally global.
// Only a receiver written out at the dispatch site is judged: an app node
// (`el.dispatchEvent`), or a target computed into a local — including the
// `document.activeElement ?? cell ?? document.body` fallback ladder a real adapter
// resolves its target with — is beyond a static read, and this pack's direction on
// anything it cannot read is silence. What is dispatched is resolved exactly as the
// sibling does: the real-input event interfaces (lib.mjs INPUT_EVENT_CLASSES) only,
// through one constructor-alias hop and one local-variable hop. A `CustomEvent` at
// `window` is your own signal to your own listener and is never judged; nor is a
// non-input event like `new Event('resize')`, which is exactly what `window` is the
// right target for. Comments are stripped first, so the paragraphs above — and the
// prose that names the trap — cannot fire the rule.

// A receiver that is literally the document, the body, the root element or the
// window, with an optional window-ish qualifier (`window.document.body`). The
// `document.body` / `document.documentElement` arms come first so the alternation
// prefers the longest real receiver.
const DISPATCH_AT_GLOBAL =
  /\b((?:(?:window|globalThis|self)\s*\.\s*)?(?:document\s*\.\s*(?:body|documentElement)|document|window|globalThis|self))\s*\.\s*dispatchEvent\s*\(/g;

const BARE_ARG = /^\(\s*([A-Za-z_$][\w$]*)\s*\)$/;

const rule = {
  id: 'input-events-target-app-subtree',
  severity: 'blocking',
  description: 'A synthetic user-input event is dispatched inside the app\'s subtree, not at document/body/window',
  doc: '.claudinite/local/packs/host-page-adaptation/RULES.md',
  why: 'a host app delegates input handling near its own root, which is a descendant of <body> — an event dispatched at document, body or window bubbles up and away from that root, so the handler never runs, silently, and it reads as "the app ignores untrusted events"',

  run(ctx) {
    const out = [];
    for (const file of ctx.files) {
      if (!isSource(file)) continue;
      const raw = ctx.read(file);
      if (raw === null || !raw.includes('dispatchEvent')) continue;
      const src = stripComments(raw);
      const ctors = inputEventCtors(src);
      const constructions = eventConstructions(src, ctors);

      DISPATCH_AT_GLOBAL.lastIndex = 0;
      for (let m = DISPATCH_AT_GLOBAL.exec(src); m; m = DISPATCH_AT_GLOBAL.exec(src)) {
        const args = balanced(src, DISPATCH_AT_GLOBAL.lastIndex - 1);
        if (args === null) continue; // unbalanced source: say nothing

        // What is being dispatched — constructed inline in the call, or one hop
        // away in a local the call names.
        let name = eventConstructions(args, ctors)[0]?.name ?? null;
        if (name === null) {
          const bare = BARE_ARG.exec(args);
          if (bare) {
            const built = constructions.find((c) => assignedTo(src, c.index) === bare[1]);
            name = built?.name ?? null;
          }
        }
        if (name === null) continue; // not a real-input event, or unreadable: quiet

        const target = m[1].replace(/\s+/g, '');
        out.push(finding(rule, {
          file,
          line: lineOf(src, m.index),
          what: `dispatches a ${name} at ${target}, which sits above the host app's own root`,
          fix: `dispatch it at a node inside the app's subtree instead — the element the app focused when it has focus, otherwise a known app node (a grid cell, the app's container). The app listens by delegation near its root, a descendant of <body>, so an event aimed at ${target} bubbles away from that listener and is never seen; dispatchEvent still returns true and nothing throws`,
        }));
      }
    }
    return out;
  },
};

export default rule;
