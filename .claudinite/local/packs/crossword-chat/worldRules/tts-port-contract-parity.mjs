import { finding } from '../../../../shared/engine/checks/helpers/findings.mjs';
import { stripComments } from '../../../../shared/engine/checks/helpers/code-scanning.mjs';

// The content script has no chrome.tts, so speak()/cancel() are relayed to the
// service worker over the cc-session port (speech/remote-tts-port.js) instead of
// calling chrome.tts directly (speech/tts-port.js) — and the orchestrator wires
// whichever one it's handed the same way, so a divergence in the returned
// object's method names breaks that substitution silently: no throw, just a
// caller reaching for a method that isn't there.
//
// PARSED, NOT GREPPED: each file's own exported factory returns exactly one
// object literal (`return { ... }`), and this walks it with a bracket-depth
// counter (skipping string/template literals) to collect the property names
// declared directly on that object — never a nested method's own calls, which
// sit at a deeper depth and never (falsely) read as part of the contract.
export const PORT_FILES = [
  'extension/src/speech/tts-port.js',
  'extension/src/speech/remote-tts-port.js',
];

function returnedMethodNames(src) {
  const ret = /\breturn\s*\{/.exec(src);
  if (!ret) return null;
  let depth = 0;
  let ident = '';
  const names = new Set();
  for (let i = ret.index + ret[0].length - 1; i < src.length; i++) {
    const c = src[i];
    if (c === '"' || c === "'" || c === '`') {
      const quote = c;
      for (i += 1; i < src.length; i++) {
        if (src[i] === '\\') { i += 1; continue; }
        if (src[i] === quote) break;
      }
      ident = '';
      continue;
    }
    if (/[A-Za-z0-9_$]/.test(c)) { ident += c; continue; }
    if (c === '(' && depth === 1 && ident) names.add(ident);
    if (c === '{' || c === '[' || c === '(') depth += 1;
    else if (c === '}' || c === ']' || c === ')') {
      depth -= 1;
      if (depth === 0) return [...names]; // matching close of the returned object
    }
    ident = '';
  }
  return null; // unbalanced — say nothing rather than guess
}

const rule = {
  id: 'tts-port-contract-parity',
  severity: 'blocking',
  since: '2026-09-13',
  description: 'remote-tts-port.js and tts-port.js expose the identical speak/cancel contract',
  doc: '.claudinite/local/packs/crossword-chat/RULES.md',
  why: 'chrome.tts does not exist in a content script, so speak()/cancel() are relayed to the service worker over the cc-session port instead of calling chrome.tts directly — the orchestrator wires either port the same way, so a method one exposes and the other does not breaks that substitution with no throw and no log',

  run(ctx) {
    const parsed = PORT_FILES.map((file) => {
      const raw = ctx.read(file);
      if (raw === null) return null;
      const names = returnedMethodNames(stripComments(raw));
      return names ? { file, names: new Set(names) } : null;
    });
    if (parsed.some((p) => p === null)) return []; // a port file is missing or unbalanced — say nothing
    const [a, b] = parsed;
    const out = [];
    for (const [from, to] of [[a, b], [b, a]]) {
      for (const name of from.names) {
        if (to.names.has(name)) continue;
        out.push(finding(rule, {
          file: from.file,
          what: `exposes "${name}" on its returned port object, which ${to.file} does not`,
          fix: `add "${name}" to ${to.file}'s returned object, or remove it from ${from.file} — the two ports must expose the identical contract so the orchestrator can use either one interchangeably`,
        }));
      }
    }
    return out;
  },
};

export default rule;
