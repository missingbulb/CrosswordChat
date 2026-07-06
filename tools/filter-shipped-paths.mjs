// Filters a list of repo-relative paths (stdin, one per line — e.g. `git diff --name-only`)
// down to the ones that feed the shipped bundle: everything under extension/ (the manifest,
// the bundled src/, the icons). The daily auto-release workflow pipes a diff through this to
// decide whether a release is warranted: empty output = nothing deployable changed. Always
// exits 0.
//
// Dependency-free on purpose: the daily-release workflow runs it on a bare runner (no npm ci).

const shipped = (path) => path.startsWith('extension/');

let input = '';
process.stdin.setEncoding('utf8');
for await (const chunk of process.stdin) input += chunk;

const matches = input
  .split('\n')
  .map((line) => line.trim())
  .filter((line) => line && shipped(line));

if (matches.length) process.stdout.write(`${matches.join('\n')}\n`);
