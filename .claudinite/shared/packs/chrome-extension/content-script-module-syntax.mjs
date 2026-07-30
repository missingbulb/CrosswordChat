import { finding } from '../../engine/checks/helpers/findings.mjs';
import { stripComments } from '../../engine/checks/helpers/code-scanning.mjs';

// Converted from the chrome-extension prose: a content script is injected as a
// *classic* script — there is no module mode for a static `content_scripts`
// entry or for `chrome.scripting.registerContentScripts` (unlike a page's
// `<script type="module">` or the MV3 module service worker). A top-level
// `import`/`export` in one therefore throws `Uncaught SyntaxError: Cannot use
// import statement outside a module`, and it throws in the HOST PAGE's console,
// not the extension's — so the extension simply appears dead and nothing in the
// developer's own devtools says why. Blocking: the script never runs at all.
//
// PARSED, NOT GREPPED (the skill's rule): grepping every source file for
// `^import` would flag the whole codebase, because module syntax is correct
// everywhere except this one injection surface. Three scopings make the
// detection mean what the rule means:
//   1. the file set comes from the MANIFEST — only the paths a `content_scripts`
//      entry's `js` array names (resolved against the manifest's own directory),
//      plus the same array on a `registerContentScripts` call. A module the
//      content script dynamically imports is fine and is never in that set;
//   2. before the judged file is read, comments are stripped and string/template
//      literal CONTENTS are blanked, so prose describing the trap — and a code
//      string a script builds to inject elsewhere — never fire it;
//   3. dynamic `import(...)` — the documented remedy — is excluded by
//      construction: the match requires a module specifier or a binding right
//      after the keyword, never an opening paren. `import.meta` likewise.

const MANIFEST = /(^|\/)manifest\.json$/;
const SOURCE = /\.(?:mjs|cjs|js|jsx|ts|tsx)$/;
const REGISTER = /\bregisterContentScripts\s*\(/g;

// A static import statement: `import 'x'`, `import d from 'x'`, `import { a } from 'x'`,
// `import * as n from 'x'`. Anchored at a statement start (a static import is only
// legal at top level, so line-start after the blanking pass is exactly that).
const STATIC_IMPORT = /^[ \t]*import\s+(?:[^\n;()]*?\bfrom\s*)?['"]/m;
// An export declaration — equally a SyntaxError in a classic script.
const STATIC_EXPORT = /^[ \t]*export\s*(?:\{|\*|default\b|(?:declare\s+)?(?:async\s+)?(?:const|let|var|function|class|type|interface|enum)\b)/m;

// `source` with the *contents* of every string/template literal replaced by
// spaces (newlines kept, so line numbers never shift). Quotes themselves stay,
// so the shape of the code is intact — only what a literal SAYS is silenced.
function blankLiterals(source) {
  let out = '';
  let quote = null;
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (quote === null) {
      out += c;
      if (c === "'" || c === '"' || c === '`') quote = c;
      continue;
    }
    if (c === '\\') { out += '  '; i += 1; continue; }
    if (c === quote) { out += c; quote = null; continue; }
    out += c === '\n' ? '\n' : ' ';
  }
  return out;
}

const lineOf = (src, index) => src.slice(0, index).split('\n').length;

// The first module-syntax statement in `text`, or null. Returns the keyword and
// its 1-based line so the finding points at the exact statement.
function moduleSyntax(text) {
  const src = blankLiterals(stripComments(text));
  const hits = [];
  for (const [kind, re] of [['import', STATIC_IMPORT], ['export', STATIC_EXPORT]]) {
    const m = re.exec(src);
    if (m) hits.push({ kind, line: lineOf(src, m.index + m[0].search(/\S/)) });
  }
  if (!hits.length) return null;
  return hits.sort((a, b) => a.line - b.line)[0];
}

// The repo path an extension-root-relative entry names. Chrome resolves both a
// manifest `js` entry and a `registerContentScripts` `js` entry from the
// EXTENSION ROOT — the manifest's own directory — never from the referring
// file's, so both resolve the same way and a leading `/` or `./` is the same file.
function resolveFromRoot(root, entry) {
  if (typeof entry !== 'string' || !entry) return null;
  const rel = entry.replace(/^\.?\//, '');
  if (!rel || rel.includes('..')) return null; // outside the extension root — not ours to judge
  return root + rel;
}

// The directory an extension manifest sits in, as a repo path prefix ('' at the root).
const dirOf = (path) => (path.includes('/') ? path.slice(0, path.lastIndexOf('/') + 1) : '');

// Every `js:` string literal on a `registerContentScripts(...)` argument. Only
// literals: a path the code computes is not something a static scan can resolve,
// and guessing is how a check earns a false alarm.
function registeredScriptPaths(src) {
  const paths = [];
  REGISTER.lastIndex = 0;
  for (let m = REGISTER.exec(src); m; m = REGISTER.exec(src)) {
    // Read the call's argument text up to the matching close paren.
    let depth = 0;
    let end = m.index + m[0].length - 1;
    for (let i = end; i < src.length; i++) {
      const c = src[i];
      if (c === '(' || c === '{' || c === '[') depth += 1;
      else if (c === ')' || c === '}' || c === ']') {
        depth -= 1;
        if (depth === 0) { end = i; break; }
      }
    }
    const arg = src.slice(m.index, end + 1);
    const js = /\bjs\s*:\s*\[([^\]]*)\]/.exec(arg);
    if (!js) continue;
    for (const lit of js[1].matchAll(/['"]([^'"]+)['"]/g)) paths.push(lit[1]);
  }
  return paths;
}

const rule = {
  id: 'content-script-module-syntax',
  severity: 'blocking',
  description: 'A content script\'s own files carry no static import/export — they are injected as classic scripts',
  doc: 'packs/chrome-extension/RULES.md',
  why: 'static `content_scripts` and `chrome.scripting.registerContentScripts` inject their files as CLASSIC scripts — there is no module mode — so a top-level import throws "Cannot use import statement outside a module" and the script never runs, and the error lands in the host page\'s console rather than the extension\'s, so nothing in your own devtools says why',

  run(ctx) {
    // The extension roots — a manifest.json declaring manifest_version. No
    // manifest, no extension: the rule self-gates to [] on every unrelated repo.
    const roots = [];
    const targets = new Map(); // repo path -> the manifest/source that named it

    for (const file of ctx.tracked) {
      if (!MANIFEST.test(file)) continue;
      const raw = ctx.read(file);
      if (raw === null || !raw.includes('"manifest_version"')) continue;
      let manifest;
      try { manifest = JSON.parse(raw); } catch { continue; }
      roots.push(dirOf(file));
      for (const entry of Array.isArray(manifest.content_scripts) ? manifest.content_scripts : []) {
        for (const js of Array.isArray(entry?.js) ? entry.js : []) {
          const path = resolveFromRoot(dirOf(file), js);
          if (path && !targets.has(path)) targets.set(path, file);
        }
      }
    }
    if (!roots.length) return [];

    for (const file of ctx.files) {
      if (!SOURCE.test(file)) continue;
      const raw = ctx.read(file);
      if (raw === null || !raw.includes('registerContentScripts')) continue;
      // Comments stripped (a commented-out registration is not a registration);
      // literals kept, because the paths themselves ARE the literals.
      for (const js of registeredScriptPaths(stripComments(raw))) {
        // Resolve against each extension root; the tracked one is the file meant.
        const path = roots.map((r) => resolveFromRoot(r, js)).find((p) => p && ctx.tracked.includes(p));
        if (path && !targets.has(path)) targets.set(path, file);
      }
    }

    const out = [];
    for (const [path, declaredIn] of [...targets].sort()) {
      const text = ctx.read(path);
      if (text === null) continue; // a build output that isn't tracked — nothing to read
      const hit = moduleSyntax(text);
      if (!hit) continue;
      out.push(finding(rule, {
        file: path,
        line: hit.line,
        what: `is injected as a content script (declared in ${declaredIn}) but uses a top-level \`${hit.kind}\` statement`,
        fix: 'make this file a classic script, and reach the module code with a *dynamic* import instead: register a tiny classic loader whose only statement is `import(chrome.runtime.getURL("your-module.js"))` (legal in a classic script, and the module runs in the same isolated world with the content-script chrome.* surface intact), then list that module and its whole transitive import graph under `web_accessible_resources`',
      }));
    }
    return out;
  },
};

export default rule;
