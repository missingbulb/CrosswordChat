# browser-speech pack (local)

A pack for the **browser speech surfaces**: `SpeechRecognition` / `webkitSpeechRecognition`,
`chrome.tts`, `speechSynthesis`, and the microphone capture behind them. Declared by hand as
`local/browser-speech` in `.claudinite-checks.json`.

**Every rule judges a browser API contract, not a product decision.** Each one holds in any
voice-driven web app — nothing in a rule's logic, rationale, or fix text is specific to this
repo, and the scan is repo-shape agnostic (see below), so the pack cannot pass vacuously green
somewhere laid out differently. This repo is where the rules were *discovered* and is the corpus
they are verified against; it is not what they are about.

**Why local, not a canon declaration:** the mounted canon shelf has no home for this facet. The
`chrome-extension` pack covers MV3 build/runtime gotchas and says nothing about speech;
`chrome-extension-release`, `node`, `github-actions`, `tidy-repo`, `spec-driven-product` and
`executable-requirements` are all orthogonal. Nothing here duplicates a canon rule.

**Provenance:** distilled from this repo's real usage — `extension/src/speech/` (`stt-port.js`,
`tts-port.js`, `remote-tts-port.js`, `biasing.js`), the sequential action loop in
`extension/src/app/orchestrator.js`, decisions D2 and D11 in `dev/docs/ARCHITECTURE.md`, the
`aec`/`od` diagnostics in `dev/docs/SESSION-LOG.md`, and the mic-teardown live check in issue
\#63. Nothing in it is invented.

**Promotion note:** the checks are written to be lifted as-is — repo-shape agnostic scan, API
contracts only, no project identifiers in any rule's logic or messages — so the central promote
stage should be able to move them into a canon `browser-speech` (or `web-speech`) technology pack
with only the `doc:` paths rewritten. The `RULES.md` prose is the part still worth re-reading for
project coupling at promote time: some of it records tuning this product measured (the pause
window) rather than a fact of the API. Until then it lives here.

## Checks

| Check | Enforces (≤5 words) | Severity |
|---|---|---|
| `tts-speak-settles` | speak settles on every outcome | blocking |
| `stt-terminal-handlers` | recognizer wires onend and onerror | blocking |
| `mic-capture-released` | getUserMedia capture stops its tracks | blocking |

**Scope.** All three scan any browser source file (`.js/.mjs/.cjs/.ts/.tsx/.jsx`) except test and
vendor paths — never a hard-coded project root. Each rule is already gated on the speech API it
judges actually appearing in the file, so the API usage *is* the trigger and the scan can be
repo-shaped; a path scope wired to one layout would make every rule match zero files and pass
vacuously green elsewhere, which is the worst failure mode a check has. The exclusion that
matters — test scaffolding, whose hand-rolled speech fakes implement only the halves of a
contract a given case needs — is stated directly, by test/vendor path and test filename.

**Both DOM wiring forms count.** `el.onend = …` and `el.addEventListener('end', …)` are equally
correct, so every handler rule accepts either (`lib.mjs` `wires`). A rule that knew only the
property form would silently pass half the world's code and false-alarm on any file mixing the
two.

Red-first fixtures live in `pack.test.mjs`: each rule is run against a violating source and a
clean one — in both wiring forms, and in TypeScript under a plain `src/` as well as JavaScript —
and then against this repo's real `extension/src/` tree, which must stay quiet. The project's
vitest run picks the file up via the `.claudinite/local/packs/**/*.test.mjs` include in
`vitest.config.js`, so the checks ship green in CI.

## Prose (`RULES.md`)

| Rule (≤5 words) | How enforced |
|---|---|
| chrome.tts unavailable to content scripts | prose |
| recognizer takes no audio constraints | prose |
| preflight the mic deliberately | prose |
| endpointing fails; monitor mid-utterance pauses | prose |
| biasing is on-device only | prose |
| voices load lazily; default is worst | prose |
| map speech errors to a taxonomy | prose |
