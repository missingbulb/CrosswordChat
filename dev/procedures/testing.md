# Testing & CI notes

Project-specific test/CI conventions, layered on the shared Claudinite canon.
Keep entries terse, and only for traps that bite **across files**: a trap you'd
only hit *while editing one test file* goes in that file's own header comment
(e.g. `extension-test/unit/arch.test.js`) — the canon owns this file-local
footgun rule (`.claudinite/skills/lessons-learned/extracting-lessons.md`).

## Install deps before the first test run — and never let `npx` resolve vitest

A checkout here usually starts with **no `node_modules`** (nothing installs them —
there is no dep-installing SessionStart hook, and an isolated agent worktree gets
none either). Run `npm ci` **first**, then `npm test`.

The trap is what happens if you don't: `npx vitest …` does not fail with "deps
missing". It silently fetches its own **vitest 4** — the repo pins `^3.0.0` — and
dies inside `vitest.config.js` with `[UNRESOLVED_IMPORT] Could not resolve
'vitest/config'`, which reads like a broken config rather than an empty
`node_modules`. Every wasted minute chasing that config is spent on a file that is
fine.

So: `npm ci` before the first test command, and reach for the `package.json`
scripts (`npm test`, `npm run test:ui`, `npm run verify`) rather than bare `npx`,
so the pinned vitest is the one that runs.
