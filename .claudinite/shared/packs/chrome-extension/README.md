# chrome-extension pack

Active when a `manifest.json` declares `manifest_version` — the MV3 build/runtime gotchas that apply while you're *coding* an extension. Mostly prose (`RULES.md`); the gotchas with a static signature in the source are checks.

Releasing and Chrome-Web-Store publication live here too, in the [**chrome-store-releases**](skills/chrome-store-releases/SKILL.md) skill (the standard: the pipeline's contract, the setup steps, the manual store actions), the **vendored release set** ([`stubs/workflows/`](stubs/workflows/) + [`stubs/actions/`](stubs/actions/), materialized into each consumer's own `.github/` by the `chrome-release-vendoring` migration), the `cer/` conformance checks, and the `store-release` task that fires the daily release. GitHub only resolves a reusable workflow / composite action from a repo's own `.github/`, so the pack holds the templates and each consumer hosts a managed copy — no cross-repo `@main` dependency.

**The release half is gated on shipping, not on a second declaration.** It was its own opt-in pack, `chrome-extension-release`, until #1057; its `detect` was the orchestrator workflow's name, so the fact that decided whether the release rules applied was always structural and the declaration was a second copy of it. That fact is now read where it is used — `shipsReleasePipeline` in [`release-workflows.mjs`](worldRules/release-workflows.mjs) gates the coded rule, every `cer/` declared check carries the same test as its `relevantWhen`, and the `store-release` task's precondition asks the same question of the `release` signal. A repo that only codes an extension is asked for no release config, no privacy page and no README release section; a repo that publishes gets all of it without declaring anything.

The `cer/` check ids are kept as they were: a member's `accept` entries name rules by id, and renaming one silently orphans an acceptance.

## What the pack carries

The gotchas themselves live in [`RULES.md`](RULES.md), grouped by the surface each concerns —
service worker, content scripts, permissions and host access, sign-in and tokens, extension UI
surfaces, and introspecting a service worker over CDP. The index below is held against that prose by
the corpus-wide rule-index drift guard, which is what makes a second listing safe here: an earlier
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
| `cer/release-workflows` | high | correctness | check: blocking |
| `cer/template-tokens` | high | correctness | check: blocking |
| `cer/release-config` | high | correctness | check: blocking |
| `cer/version-sync` | high | correctness | check: blocking |
| `cer/version-bumped` | high | correctness | check: blocking |
| `cer/release-layout` | medium | correctness | check: blocking |
| `cer/readme-sections` | low | complexity | check: blocking |
| `cer/privacy-permission-alignment` | critical | legal | check: blocking |
| `cer/permission-added-store-issue` | high | legal | check: advisory |

Every `cer/` rule is about a release that would otherwise fail — or publish the wrong thing — only once it reached the store, and every one of them is inert until this repo ships the pipeline. `cer/version-bumped` is the one work-scope rule among them: the tree always carries a version, and only the diff says whether it moved with the shipped files beside it.

## Skills

[**chrome-store-releases**](skills/chrome-store-releases/SKILL.md) is the release standard itself — the vendored workflows and composite actions, `.github/release.config`, versioning and the packaged artifact, the store secrets, the README install sections, and the manual Chrome Web Store steps. It is the contract the `cer/` checks judge against, reached when a pipeline is being set up or debugged rather than carried by every session in the repo.

## Task

`tasks/store-release/` fires the repo's daily release: agentless, `code_work` only, dispatching the vendored daily workflow. It absorbed that workflow's own 00:30 cron so the Claudinite scheduler stays the repo's only one, and its precondition declines on a repo that does not publish.
