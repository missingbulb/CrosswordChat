// THE SUBPROCESS PORT. Two things this pack runs outside its own process — the
// agent's code-work command, and git — and both are spelled here so `src/` holds
// exactly one module that can start one.
//
// The two shapes are genuinely different and stay separate: code-work is long,
// streamed and killable, git is short and read for its stdout. A single
// "run a command" helper would have to serve both and would serve neither.

import { spawn, execFileSync } from 'node:child_process';

// Start a command and stream its output. Returns the child, so the caller owns the
// timeout, the kill and whatever it does with the streams — the executor's leash
// is policy and does not belong down here.
export const startProcess = (command, args, options) => spawn(command, args, options);

// Run git and read its stdout. `maxBuffer` is generous on purpose: a generated
// file can be large, and a `git show` of one easily tops spawn's default 1 MiB —
// which fails as a truncated read, not as an error.
//
// stdin is 'pipe' exactly when there is input to pipe: an explicit 'ignore' with
// an `input` set silently feeds the child NOTHING, and `hash-object --stdin` then
// cheerfully writes the empty blob — a wrong answer, not an error.
export const runGit = (args, opts = {}) => execFileSync('git', args, {
  encoding: 'utf8',
  maxBuffer: 256 * 1024 * 1024,
  stdio: [opts.input === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'],
  ...opts,
});
