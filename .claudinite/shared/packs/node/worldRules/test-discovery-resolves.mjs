import { finding } from '../../../engine/checks/helpers/findings.mjs';
import { workflowFiles } from '../../../engine/checks/helpers/github-workflows.mjs';

// WHY. Node's default `--test` discovery skips dot-directories outright (see
// RULES.md's "Test discovery" section), so an invocation naming no path finds
// nothing, reports success, and reads exactly like a passing suite when the
// repo's tests live under a dot-path. A `node --test` invocation whose argument
// resolves to no file in the tree is the same failure one step later: a typo'd
// glob, a moved fixture, a renamed directory. Watching the run go green is
// never the confirmation; a statically non-empty argument set is.
//
// SCOPE. The command surfaces a run can be spelled on: `package.json` scripts
// (the local invocation) and `.github/workflows/*.yml` (the CI step). A command
// carrying shell interpolation (`$…`, backticks) is not judged — its arguments
// are not knowable from the artifact, and a check that guesses cries wolf.

// A vendored mount (e.g. Claudinite's own `.claudinite/shared/`) is canon-owned
// and out of scope for a consumer's own test-discovery coverage.
const VENDORED_PREFIX = '.claudinite/shared/';

// A shell command's tokens, quotes stripped. Deliberately naive: the commands
// this rule reads are short literal invocations, and anything with substitution
// in it is skipped before we get here.
function tokenize(command) {
  return command.trim().split(/\s+/).filter(Boolean).map((t) => t.replace(/^['"]|['"]$/g, ''));
}

// Split a script body / run: line into individual commands on the shell's
// separators, so `npm ci && node --test` is judged as its two commands.
function commands(text) {
  return text.split(/\n|&&|\|\||[;|]/g);
}

// A glob token as a regex over '/'-separated repo paths: `**` crosses
// directories, `*` and `?` do not.
function globToRegExp(pattern) {
  let out = '';
  for (let i = 0; i < pattern.length; i += 1) {
    const c = pattern[i];
    if (c === '*') {
      if (pattern[i + 1] === '*') {
        // `**/` may match zero directories, so the following slash is optional.
        i += 1;
        if (pattern[i + 1] === '/') { i += 1; out += '(?:.*/)?'; } else out += '.*';
      } else out += '[^/]*';
    } else if (c === '?') out += '[^/]';
    else out += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${out}$`);
}

// Does this argument name at least one file that exists in the repo — as a
// glob, an exact path, or a directory holding files?
export function resolvesToFiles(arg, paths) {
  if (!arg) return false;
  if (/[*?[\]]/.test(arg)) {
    const re = globToRegExp(arg);
    return paths.some((p) => re.test(p));
  }
  const clean = arg.replace(/\/+$/, '');
  return paths.some((p) => p === clean || p.startsWith(`${clean}/`));
}

// The invocations of `node --test` in one command string, and whether each
// one's arguments resolve. Exported for the fixture.
export function judgeCommand(command, paths) {
  if (/[$`]/.test(command)) return null; // interpolated — not knowable from the artifact
  const tokens = tokenize(command);
  const nodeAt = tokens.findIndex((t) => t === 'node' || t.endsWith('/node'));
  if (nodeAt < 0) return null;
  const args = tokens.slice(nodeAt + 1);
  if (!args.includes('--test')) return null;
  // Flags are skipped; every other token is a candidate path. A flag's separate
  // value can only ever make the rule quieter, never noisier.
  const positional = args.filter((t) => !t.startsWith('-'));
  return { ok: positional.some((a) => resolvesToFiles(a, paths)) };
}

const rule = {
  id: 'node/test-discovery-resolves',
  severity: 'blocking',
  since: '2026-09-06',
  description: 'A `node --test` invocation must name test paths that exist — default discovery skips dot-directories',
  doc: 'packs/node/RULES.md',
  why: "Node's test discovery ignores dot-directories, so an invocation naming no existing path (or a stale glob) runs zero tests and exits green — indistinguishable from a passing suite",

  run(ctx) {
    // Tracked ∪ scanned: `ctx.tracked` is the whole tree in either mode, and
    // `ctx.files` adds the not-yet-committed ones — a test file added in the
    // same change as the step that runs it must resolve, or the rule fires on
    // the very commit that fixes it.
    const paths = [...new Set([...ctx.tracked, ...(ctx.files || [])])]
      .filter((f) => !f.startsWith(VENDORED_PREFIX));
    const out = [];

    const report = (file, line, command) => out.push(finding(rule, {
      file,
      line,
      what: `\`${command.trim()}\` names no test path that exists in the tree, so it discovers nothing and exits green`,
      fix: "pass an explicit path or glob for the tests, e.g. `node --test 'test/**/*.test.mjs'`, and confirm the run's test count is non-zero",
    }));

    const pkg = ctx.read('package.json');
    if (pkg !== null) {
      let scripts = {};
      try { scripts = JSON.parse(pkg).scripts || {}; } catch { scripts = {}; }
      const lines = pkg.split('\n');
      for (const [name, body] of Object.entries(scripts)) {
        if (typeof body !== 'string') continue;
        for (const command of commands(body)) {
          const verdict = judgeCommand(command, paths);
          if (verdict && !verdict.ok) {
            const at = lines.findIndex((l) => l.includes(`"${name}":`));
            report('package.json', at < 0 ? null : at + 1, command);
          }
        }
      }
    }

    for (const wf of workflowFiles(ctx)) {
      const text = ctx.read(wf);
      if (text === null) continue;
      const lines = text.split('\n');
      for (let i = 0; i < lines.length; i += 1) {
        for (const command of commands(lines[i])) {
          const verdict = judgeCommand(command, paths);
          if (verdict && !verdict.ok) report(wf, i + 1, command);
        }
      }
    }

    return out;
  },
};

export default rule;
