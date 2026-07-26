import { finding } from '../../engine/checks/helpers/findings.mjs';
import { stripComments } from '../../engine/checks/helpers/code-scanning.mjs';

// Converted from the chrome-extension prose: a `chrome.declarativeContent.SetIcon`
// action built with `path` silently leaves the icon unset. The rules are evaluated
// by the *browser process*, so the icon must already be raw pixels when the rule is
// registered — `imageData` is the only option that survives. Blocking: the failure
// is silent (no throw, no console error), so nothing else catches it.
//
// PARSED, NOT GREPPED (the skill's rule): grep for `path:` would drown in false
// alarms, and even `SetIcon` alone is ambiguous. Two scopings kill that:
//   1. the `declarativeContent.` qualifier is required — `chrome.action.setIcon({path})`
//      is the *correct* use of the (differently-cased) action API and must stay quiet;
//   2. only the SetIcon argument's OWN depth-1 keys are read, so a `path` nested
//      deeper, or belonging to some neighbouring call, is not this rule's business.
// Comments are stripped first, so prose describing the trap never fires it.

const SOURCE = /\.(?:mjs|cjs|js|jsx|ts|tsx)$/;
const CALL = /\bdeclarativeContent\s*\.\s*SetIcon\s*\(\s*\{/g;

// Advance past a string/template literal that opens at `i`, honoring backslash
// escapes; returns the index of its closing quote. Shared by both passes so a
// brace or colon inside "a{b:c}" can never be read as syntax.
function endOfString(src, i) {
  const quote = src[i];
  for (i += 1; i < src.length; i++) {
    if (src[i] === '\\') { i += 1; continue; }
    if (src[i] === quote) return i;
  }
  return src.length;
}

// The balanced object literal beginning at the `{` at index `open`, or null when
// the source is unbalanced (a half-written file — say nothing rather than guess).
function objectLiteral(src, open) {
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    const c = src[i];
    if (c === '"' || c === "'" || c === '`') { i = endOfString(src, i); continue; }
    if (c === '{' || c === '[' || c === '(') depth += 1;
    else if (c === '}' || c === ']' || c === ')') {
      depth -= 1;
      if (depth === 0) return src.slice(open, i + 1);
    }
  }
  return null;
}

// The property names written at the object's own top level — `{ path: … }` and
// `{ 'path': … }` count, anything inside a nested object/array/call does not.
function topLevelKeys(obj) {
  const keys = [];
  let depth = 0;
  let token = '';
  for (let i = 0; i < obj.length; i++) {
    const c = obj[i];
    if (c === '"' || c === "'" || c === '`') {
      const end = endOfString(obj, i);
      if (depth === 1) token = obj.slice(i + 1, end);
      i = end;
      continue;
    }
    if (c === '{' || c === '[' || c === '(') { depth += 1; token = ''; continue; }
    if (c === '}' || c === ']' || c === ')') { depth -= 1; token = ''; continue; }
    if (depth !== 1) continue;
    if (c === ':') { if (token.trim()) keys.push(token.trim()); token = ''; continue; }
    if (c === ',') { token = ''; continue; }
    token += c;
  }
  return keys;
}

const rule = {
  id: 'declarative-content-set-icon',
  severity: 'blocking',
  description: 'A chrome.declarativeContent.SetIcon action supplies imageData, never path',
  doc: 'packs/chrome-extension/RULES.md',
  why: 'declarativeContent rules are evaluated by the browser process, so the icon must already be raw pixels at registration time — the documented path option can silently leave the icon unset, with no throw and no console error to notice',

  run(ctx) {
    const out = [];
    for (const file of ctx.files) {
      if (!SOURCE.test(file)) continue;
      const raw = ctx.read(file);
      if (raw === null || !raw.includes('declarativeContent')) continue;
      const src = stripComments(raw);
      CALL.lastIndex = 0;
      for (let m = CALL.exec(src); m; m = CALL.exec(src)) {
        const obj = objectLiteral(src, m.index + m[0].length - 1);
        if (obj === null || !topLevelKeys(obj).includes('path')) continue;
        out.push(finding(rule, {
          file,
          line: src.slice(0, m.index).split('\n').length,
          what: 'builds a declarativeContent.SetIcon action from a path',
          fix: "pass imageData instead — a service worker has no DOM, so decode the packaged icon yourself: fetch(chrome.runtime.getURL(icon)) → blob → createImageBitmap → OffscreenCanvas.drawImage → getImageData",
        }));
      }
    }
    return out;
  },
};

export default rule;
