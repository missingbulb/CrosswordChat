import { finding } from '../../../engine/checks/helpers/findings.mjs';
import { stripComments } from '../../../engine/checks/helpers/code-scanning.mjs';
import { isSource, lineOf, balanced } from '../lib.mjs';

// The Web Speech error-name set is OPEN. `SpeechRecognitionErrorEvent.error` is a
// spec enum today, but browsers extend it — Chrome has shipped names outside the
// original list, and a vendor-prefixed engine can invent one at any release. So a
// switch that maps raw error names onto an application taxonomy is a TOTAL
// function or it is a bug: with no `default:` arm, an unenumerated name falls off
// the end and the mapping returns `undefined`.
//
// `undefined` is the worst possible answer here because nothing downstream
// notices. The dialog policy branches on the kind — "was the mic refused?", "did
// we abort on purpose?" — and every one of those comparisons is simply false, so
// the policy takes its do-nothing arm. Nothing throws, nothing logs, the UI keeps
// showing a live session, and the user is heard by nobody. Speech failures are
// silent, so every path must produce exactly one observable outcome — including
// the path a browser invented after you shipped.
//
// PARSED, NOT GREPPED — three ways, each killing a false alarm a text scan makes:
//
//   1. Case labels are read at the switch body's OWN depth. A `default:` belonging
//      to a nested switch inside one arm does not count as this switch's default,
//      and a nested switch's cases don't count toward this one's labels.
//   2. Only a MAPPING switch is judged — one whose arms `return` a value. A switch
//      that dispatches side effects over error names is a different shape with a
//      different (often legitimate) reason to omit a default, and this rule does
//      not have an honest opinion about it.
//   3. A `return`/`throw` immediately after the switch IS the fallback. The
//      idiomatic total mapping puts the catch-all there rather than in a `default:`
//      arm, and it is exactly as total. Firing on it would be pure noise — and is
//      the single false alarm a naive "no `default` in this file" grep makes most.
//
// Comments are stripped first, so the error names named in the paragraphs above
// cannot fire the rule on this very file.

// SpeechRecognitionErrorCode, as specified. Deliberately the SPEC list and not a
// superset: these are the names a mapping is expected to enumerate, and seeing two
// of them as case labels is what identifies a switch as a speech-error mapping.
// The rule's whole point is the names NOT on this list, so guessing at extensions
// here would be self-defeating.
const ERROR_NAMES = [
  'no-speech',
  'aborted',
  'audio-capture',
  'network',
  'not-allowed',
  'service-not-allowed',
  'bad-grammar',
  'language-not-supported',
];

const SWITCH = /\bswitch\s*\(/g;
const CASE = /^case\s+(['"`])([^'"`]*)\1\s*:/;
const DEFAULT = /^default\s*:/;

/**
 * The case labels and `default:` presence at a switch body's own brace depth.
 * `body` is the balanced `{…}` run including both braces. Depth-aware so a nested
 * switch inside one arm contributes neither its labels nor its default; string and
 * template literals are skipped so a colon inside `"a:b"` can't read as syntax.
 */
function arms(body) {
  const labels = new Set();
  let hasDefault = false;
  let depth = 0;
  for (let i = 1; i < body.length - 1; i++) {
    const c = body[i];
    if (c === '"' || c === "'" || c === '`') {
      const quote = c;
      for (i += 1; i < body.length; i++) {
        if (body[i] === '\\') { i += 1; continue; }
        if (body[i] === quote) break;
      }
      continue;
    }
    if (c === '{' || c === '[' || c === '(') { depth += 1; continue; }
    if (c === '}' || c === ']' || c === ')') { depth -= 1; continue; }
    if (depth !== 0 || /[\w$]/.test(body[i - 1])) continue;
    const rest = body.slice(i);
    const label = CASE.exec(rest);
    if (label) {
      labels.add(label[2]);
      i += label[0].length - 1;
      continue;
    }
    if (DEFAULT.test(rest)) hasDefault = true;
  }
  return { labels, hasDefault };
}

const rule = {
  id: 'stt-error-map-has-default',
  severity: 'blocking',
  description: 'A speech-recognition error mapping is total — every name maps to a kind',
  doc: 'packs/web-speech/RULES.md',
  why: 'the Web Speech error-name set is open — browsers extend it — so a mapping switch with no catch-all returns undefined for a name it does not enumerate; the dialog policy then compares undefined against every kind it knows, takes its do-nothing arm, and the session dies without throwing, logging, or changing the UI',

  run(ctx) {
    const out = [];
    for (const file of ctx.files) {
      if (!isSource(file)) continue;
      const raw = ctx.read(file);
      if (raw === null) continue;
      if (ERROR_NAMES.filter((name) => raw.includes(name)).length < 2) continue;
      const src = stripComments(raw);
      SWITCH.lastIndex = 0;
      for (let m = SWITCH.exec(src); m; m = SWITCH.exec(src)) {
        const parenAt = m.index + m[0].length - 1;
        const head = balanced(src, parenAt);
        if (head === null) continue;
        const braceAt = src.indexOf('{', parenAt + head.length);
        if (braceAt === -1 || src.slice(parenAt + head.length, braceAt).trim() !== '') continue;
        const body = balanced(src, braceAt);
        if (body === null) continue;

        const { labels, hasDefault } = arms(body);
        const known = ERROR_NAMES.filter((name) => labels.has(name));
        if (known.length < 2) continue; // not a speech-error mapping
        if (!/\breturn\b/.test(body)) continue; // dispatch, not a mapping
        if (hasDefault) continue;
        // A `return`/`throw` straight after the switch is the catch-all, and the
        // mapping is total without a `default:` arm.
        if (/^(?:return|throw)\b/.test(src.slice(braceAt + body.length).replace(/^[\s;]*/, ''))) continue;

        out.push(finding(rule, {
          file,
          line: lineOf(src, m.index),
          what: `a switch mapping Web Speech recognition error names (${known.join(', ')}) has no default arm, so any other name maps to undefined`,
          fix: 'give the switch a `default:` arm returning your catch-all kind (or `return` that kind straight after the switch) — the taxonomy the dialog policy reasons over has to name "some other error" explicitly, so a name this browser build invented degrades to a handled kind instead of silently becoming undefined',
        }));
      }
    }
    return out;
  },
};

export default rule;
