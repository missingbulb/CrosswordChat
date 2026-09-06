import { finding } from '../../../engine/checks/helpers/findings.mjs';
import { stripComments } from '../../../engine/checks/helpers/code-scanning.mjs';
import { isSource, lineOf, balanced, inputEventCtors } from '../lib.mjs';

// A host page delegates input handling to ONE listener near its own root — a
// descendant of `<body>` — so a bubbling event only reaches it when the event's
// target sits inside that root's own subtree. Aiming a synthetic input event at
// `document` or `document.body` puts the dispatch itself outside that subtree:
// the event bubbles from document/body straight up past the app root, and the
// delegated listener never sees it.
//
// The failure is silent in this pack's usual way: dispatchEvent still returns
// true, nothing throws, nothing logs — the page simply does not respond, which
// reads exactly like "the app ignores untrusted events" and is an expensive
// conclusion to back out of.
//
// Scoped to the same real-input interfaces as synthetic-input-events-bubble
// (lib.mjs INPUT_EVENT_CLASSES): a CustomEvent dispatched at document is your
// own signal to your own listener and has no delegation contract to hold it to.
//
// PARSED, NOT GREPPED. The receiver is read off the dispatchEvent call site
// itself (`<receiver>.dispatchEvent(`), with the one alias hop real code takes —
// `const root = document.body; root.dispatchEvent(...)` — resolved the same way
// synthetic-input-events-bubble resolves a one-hop constructor alias. Comments
// are stripped first, so the paragraphs above cannot fire the rule.

const DISPATCH = /([A-Za-z_$][\w$]*(?:\s*\.\s*[A-Za-z_$][\w$]*)*)\s*\.\s*dispatchEvent\s*\(/g;
const DOC_EXPR = /^(?:window\s*\.\s*|globalThis\s*\.\s*|self\s*\.\s*)?document(?:\s*\.\s*body)?$/;

/**
 * The document/body expression a dispatchEvent receiver resolves to — itself,
 * directly, or through one `const`/`let`/`var` alias hop — or null when the
 * receiver names neither.
 */
function resolveDocExpr(src, receiver) {
  if (DOC_EXPR.test(receiver)) return receiver;
  const decl = new RegExp(`\\b(?:const|let|var)\\s+${receiver}\\s*=\\s*([^;\\n]*)`).exec(src);
  if (!decl) return null;
  const expr = decl[1].trim();
  return DOC_EXPR.test(expr) ? expr : null;
}

/** The real-input constructor this dispatchEvent call's argument names, or null. */
function dispatchedCtor(src, args, ctors) {
  for (const ctor of ctors) {
    if (new RegExp(`\\bnew\\s+(?:[A-Za-z_$][\\w$]*\\s*\\.\\s*)?${ctor}\\s*\\(`).test(args)) return ctor;
  }
  const bare = /^\(\s*([A-Za-z_$][\w$]*)\s*\)$/.exec(args);
  if (!bare) return null;
  for (const ctor of ctors) {
    const decl = new RegExp(`\\b(?:const|let|var)\\s+${bare[1]}\\s*=\\s*new\\s+(?:[A-Za-z_$][\\w$]*\\s*\\.\\s*)?${ctor}\\s*\\(`);
    if (decl.test(src)) return ctor;
  }
  return null;
}

const rule = {
  id: 'synthetic-input-events-target-app-node',
  severity: 'blocking',
  description: 'A synthetic input event is dispatched at a node inside the app, not document/body',
  doc: 'packs/host-page/RULES.md',
  why: 'a host page handles input by delegation, one listener near its own root — an event dispatched at document or document.body bubbles past that root and never arrives, silently, and reads exactly like "the app ignores untrusted events"',

  run(ctx) {
    const out = [];
    for (const file of ctx.files) {
      if (!isSource(file)) continue;
      const raw = ctx.read(file);
      if (raw === null || !raw.includes('dispatchEvent')) continue;
      const src = stripComments(raw);
      const ctors = inputEventCtors(src);

      DISPATCH.lastIndex = 0;
      for (let m = DISPATCH.exec(src); m; m = DISPATCH.exec(src)) {
        const docExpr = resolveDocExpr(src, m[1]);
        if (!docExpr) continue;
        const argsStart = m.index + m[0].length - 1;
        const args = balanced(src, argsStart);
        if (args === null) continue;
        const ctorName = dispatchedCtor(src, args, ctors);
        if (!ctorName) continue;

        out.push(finding(rule, {
          file,
          line: lineOf(src, m.index),
          what: `dispatches a ${ctorName} at ${docExpr}, outside the app's own subtree`,
          fix: 'dispatch at a node inside the app — the selected/focused element if there is one, otherwise a known node under the app root — never document or document.body: a host page delegates input handling near its own root, and an event dispatched above that root bubbles past it and is never seen',
        }));
      }
    }
    return out;
  },
};

export default rule;
