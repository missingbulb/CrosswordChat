// What the project's instruction file costs a session is what it BRINGS, not what it
// holds: an `@path` line in CLAUDE.md pulls that file, and everything it imports in
// turn, into every window the repo ever opens, in full. So the budget is over the
// resolved tree, and the unit is tokens, because a context window is what the cost
// lands in and lines say nothing about it.
//
// Coded rather than declared: the declaration language matches lines within one file,
// and this assertion is a sum over a set of files that only reading the first one
// names. The check kept its id when it moved off `maxLines`: `usage.GENERATED.json`
// stores its finding counts under that name, and a rename would read the series as
// ending rather than continuing.
import { dirname, join, normalize } from 'node:path';
import { finding } from '../../../engine/checks/helpers/findings.mjs';
import { countWords, estimateTokens } from '../../../engine/pack_loader/token-estimate.mjs';

// Only the root file: the harness loads that one, and a CLAUDE.md under a fixture or
// an example directory costs a session nothing.
const ROOT = 'CLAUDE.md';

// One import per line, the form the harness resolves: `@` at the start of the line,
// then a path, relative to the file the line is in.
const IMPORT = /^@(\S+)\s*$/;

// Chosen as a ceiling rather than a target. The point is to notice the tree growing
// past what a session can carry alongside the work, not to demand the corpus shrink
// today. A repo whose packs legitimately cost more than this says so by raising it
// here, in one place, deliberately.
const BUDGET_TOKENS = 20000;

// The tree under the root file, each file counted once. A cycle is ordinary rather
// than exceptional (two rule files that point at each other still load once each),
// so the seen set is what bounds the walk, not a depth limit.
function importedTree(ctx, entry) {
  const seen = new Set();
  const queue = [entry];
  let words = 0;
  while (queue.length) {
    const path = queue.shift();
    if (seen.has(path)) continue;
    seen.add(path);
    const text = ctx.read(path);
    // An import resolving to nothing is not this check's finding to make: it costs a
    // session no tokens, which is the only question being asked here.
    if (text === null) continue;
    words += countWords(text);
    for (const line of text.split('\n')) {
      const m = IMPORT.exec(line);
      if (m) queue.push(normalize(join(dirname(path), m[1])));
    }
  }
  return words;
}

const rule = {
  id: 'claude-md-length',
  severity: 'advisory',
  description: 'Everything CLAUDE.md pulls into the window, counted together, stays under the context budget',
  why: 'every session in the repo pays for the whole import tree before it reads a line of the work, and the file that names it is often one line long',

  run(ctx) {
    if (!ctx.files.includes(ROOT)) return [];
    const tokens = estimateTokens(importedTree(ctx, ROOT));
    if (tokens <= BUDGET_TOKENS) return [];
    return [finding(rule, {
      file: ROOT,
      line: 1,
      what: `CLAUDE.md and what it imports come to ${tokens.toLocaleString('en-US')} tokens (budget ${BUDGET_TOKENS.toLocaleString('en-US')})`,
      fix: 'cut the rules a check now enforces, move a multi-step procedure into a skill that loads on demand, and drop a rule another pack already carries; every one of them is paid for by every session, whether or not it applies',
    })];
  },
};

export default rule;
