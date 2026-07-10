# Testing & CI notes

Project-specific test/CI conventions, layered on the shared Claudinite canon.
Keep entries terse. A trap you'd only hit *while editing one test file* belongs in
that file's own header comment (see `extension-test/unit/arch.test.js`), not here —
this file is for traps that bite across files.

## CI has no `.claudinite/` mount — never `import` a canon helper into test/tool code

`.claudinite/*` is gitignored (only `.gitkeep` is committed): the local mount is
filled by a SessionStart sync hook, and CI runs a plain `actions/checkout` with no
sync, so `.claudinite/` is **empty** on the runner. Anything under `extension-test/`
or `tools/` that imports from `.claudinite/checks/lib/...` therefore resolves in a
local session but fails `module not found` in CI. When a test wants a canon helper,
**inline a copy** instead of importing it — e.g. `arch.test.js` inlines a
string-aware `stripComments` of `checks/lib/source.mjs` for exactly this reason.
