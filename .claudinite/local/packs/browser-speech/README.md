# browser-speech pack (local)

CrosswordChat's own pack for the **browser speech surfaces** the product is built on:
`webkitSpeechRecognition`, `chrome.tts`, `speechSynthesis`, and the microphone capture behind
them. Declared by hand as `local/browser-speech` in `.claudinite-checks.json` (a local pack is
never fingerprinted or seeded — `detect`/`marker` stay null).

**Why local, not a canon declaration:** the mounted canon shelf has no home for this facet. The
`chrome-extension` pack covers MV3 build/runtime gotchas and says nothing about speech;
`chrome-extension-release`, `node`, `github-actions`, `tidy-repo`, `spec-driven-product` and
`executable-requirements` are all orthogonal. Nothing here duplicates a canon rule.

**Provenance:** distilled from this repo's real usage — `extension/src/speech/` (`stt-port.js`,
`tts-port.js`, `remote-tts-port.js`, `biasing.js`), the sequential action loop in
`extension/src/app/orchestrator.js`, decisions D2 and D11 in `dev/docs/ARCHITECTURE.md`, the
`aec`/`od` diagnostics in `dev/docs/SESSION-LOG.md`, and the mic-teardown live check in issue
\#63. Nothing in it is invented.

**Promotion note:** most of this is portable to any voice-driven web app, not just to this
product — a good candidate for the central promote stage to lift into a canon `browser-speech`
(or `web-speech`) technology pack. Until then it lives here.

## Checks

| Check | Enforces (≤5 words) | Severity |
|---|---|---|
| `tts-speak-settles` | speak settles on every outcome | blocking |
| `stt-terminal-handlers` | recognizer wires onend and onerror | blocking |
| `mic-capture-released` | getUserMedia capture stops its tracks | blocking |

All three are scoped to `extension/src/` — the code that actually runs in a browser. The test
suite's hand-rolled speech fakes implement only the halves of each contract a given case needs,
and holding purpose-built scaffolding to the production contract would be a false alarm.

Red-first fixtures live in `pack.test.mjs`: each rule is run against a violating source and a
clean one, and then against the repo's real `extension/src/` tree (which must stay quiet). The
project's vitest run picks the file up via the `.claudinite/local/packs/**/*.test.mjs` include in
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
