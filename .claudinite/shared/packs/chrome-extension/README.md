# chrome-extension pack

Active when a `manifest.json` declares `manifest_version` — the MV3 build/runtime gotchas that apply while you're *coding* an extension. Mostly prose (`RULES.md`); the gotchas with a static signature in the source are checks.

Releasing and Chrome-Web-Store publication are a separate, opt-in concern: the [`chrome-extension-release`](../chrome-extension-release/README.md) pack (its `RELEASE.md` standard + conformance checks), declared when the project is ready to ship.

## What the pack carries

The gotchas themselves live in [`RULES.md`](RULES.md), grouped by the surface each concerns —
service worker, content scripts, permissions and host access, sign-in and tokens, extension UI
surfaces, and introspecting a service worker over CDP. The index below is held against that prose by
`packs-tests/rule-index.test.mjs`, which is what makes a second listing safe here: an earlier
hand-kept one drifted into claiming a prose rule that never existed (#777).

## Rules (`RULES.md`)

| Rule | Severity | Reason | Enforcement |
|---|---|---|---|
| Passing a path from a service worker | high | correctness | prose: 68 words |
| Wanting import/export in extension code | medium | correctness | prose: 51 words |
| Assembling a shared global across files | high | correctness | prose: 51 words |
| Accumulating state in a re-injected file | high | correctness | prose: 22 words |
| Loading module code into a content script | high | correctness | prose: 118 words + check (`content-script-module-syntax`) |
| Adding an import to a content-script module | high | correctness | prose: 30 words |
| Keeping that webaccessibleresources list correct | high | correctness | prose: 29 words |
| Matching a host with chrome.events.UrlFilter | high | correctness | prose: 63 words |
| Running on third-party pages without a warning | high | legal | prose: 60 words |
| Starting the worker on a granted permission | medium | correctness | prose: 43 words |
| A listed host's fetch failing in-browser | medium | correctness | prose: 42 words |
| Reaching your own backend | medium | correctness | prose: 35 words |
| Authenticating an extension to a JWT-validating backend | critical | correctness | prose: 83 words |
| Refreshing a token silently | medium | correctness | prose: 28 words |
| Refreshing silently with two accounts | medium | correctness | prose: 41 words |
| Storing a token | critical | correctness | prose: 38 words |
| Keeping a token across a restart | medium | correctness | prose: 30 words |
| Knowing whether your side panel is open | low | correctness | prose: 37 words |
| Opening the side panel programmatically | medium | correctness | prose: 15 words |
| Putting a menu on the toolbar icon | low | correctness | prose: 30 words |
| Recreating menu items on startup | medium | correctness | prose: 30 words |
| Awaiting a chrome. callback API inside Runtime.evaluate | low | correctness | prose: 34 words |
| Reading a worker value over CDP | low | correctness | prose: 30 words |
| Attaching to a dormant worker | low | correctness | prose: 39 words |

## Checks

| Check | Severity | Reason | Enforcement |
|---|---|---|---|
| `content-script-module-syntax` | high | correctness | check: blocking |
| `declarative-content-set-icon` | medium | correctness | check: blocking |
