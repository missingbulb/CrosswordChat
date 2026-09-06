# Version history

Records for `packs/chrome-extension/pack.mjs`'s `version` field, one row per version, newest first.
A version is cut on `main` after its changes land, so a row names the pull requests that
landed between the previous version and this one; the weekly history task writes the rows
a version is missing and leaves every row that already stands.

| Version | Date | What changed |
|---|---|---|
| 60905.2 | 2026-09-05 | Pack versions are cut on main by automation, never in the pull request (#1726) |
| 60905.1 | 2026-09-05 | Task declarations name what the run does to pull requests in the four-value `expected_outcome` vocabulary (#1695): `pr` became `fresh_pr` and `none` became `no_code_changes`, the same behaviour under the word that now sits beside `amend_existing_or_create_new_pr` and `supersede_existing_pr`. |
| 60903.6 | 2026-09-03 | The two runtime host-permission rules become the `extension-host-permissions` skill, forced for any `manifest.json` edit (#1662). |
| 60903.5 | 2026-09-03 | `chrome-store-releases` forces itself for `.github/release.config` and the vendored `chrome-extension-*` workflows (`force-load-on-file-edits-paths`) (#1648): the guard holds an edit there until the skill is loaded. |
| 60903.4 | 2026-09-03 | The tolerated `@main` advisory names the convergence window its tolerance ends on rather than a census of repos still making those calls (#1652). |
| 60903.3 | 2026-09-03 | The pre-vendoring `@main` orchestrator shape now reports an advisory while the vendoring migration is live instead of returning silently: the tolerance's removal is gated on no repo still making those calls, and a repo that is never told it makes them is what holds that gate shut (#1637). |
| 60903.2 | 2026-09-02 | `RULES.md` drops the descriptive framing the pack README already carries — the file carries rules only. |
| 60903.1 | 2026-09-03 | A skill's `SKILL.md` opens on what to do, not on what the skill is: the self-describing framing and the pointers to prose the reader already holds are gone. |
| 60902.2 | 2026-09-02 | Task declarations converted to `task.json`; the declaration's comments moved into each task's README (#1633). |
| 60902.1 | 2026-09-02 | `store-release` converts to `preconditions: ['manifest-ahead || substantive-change']`, with the unreleased-bump comparison as a task-local term in `preconditions.mjs` beside the declaration. The shipping probe leaves the trigger entirely: whether a repo ships the Chrome Web Store pipeline is a fact adoption settled, so a repo that only CODES an extension names `chrome-extension/store-release` in its `taskScheduler.disabledTasks` instead of paying the question nightly (#1578). |
| 60901.1 | 2026-09-01 | The pack adopts the references convention: `references.md` records `declarative-content-set-icon`'s silent-`path` finding (#777), for the revalidation pass to reaffirm against a current Chrome (#1564). |
| 60824.1 | 2026-08-24 | Prose and tests name the scheduler at its new home in the `claudinite-tasks` pack (#1317). |
| 60823.1 | 2026-08-23 | Its release skill names the member settings file by its current name (#1252). |
| 60822.1 | 2026-08-22 | The manifest stops restating its own tree (#1246): `id`, `prose`, `badge`, `skills`, `worldRules` and `workRules` are resolved from the pack directory and an absent `detect`/`marker` means no fingerprint. Coded rules move into `worldRules/`/`workRules/` and tests into `test/`, which no vendor set ships. `minEngineVersion` rises to the engine release that reads all of it. |
| 60821.1 | 2026-08-21 | The version bump belongs to the change, not to the release flow (#1151) |
| 60820.1 | 2026-08-20 | Engine and pack versions become date-anchored `<day>.<n>` (#1105) |
| 5 | 2026-08-20 | Pack reorganization: two collapses and two renames (#1081) |
| 4 | 2026-08-20 | Collapse packs-tests/ into packs/ — a pack's tests live inside the pack (#1070) |
| 3 | 2026-08-19 | Collapse chrome-extension-release into chrome-extension, and stop packs discussing each other (#1060) |
| 2 | 2026-08-18 | Amend the rule-writing method from two independent rewrites (#775); Stop the chrome-extension README indexing RULES.md (#780); Index every pack's rules and checks with words, severity and reason (#915); Bump every pack whose content was edited without a version bump (#969) |
| 1 | 2026-08-12 | Context-relief architecture: packs (prose + checks) and skills, with enforcement (#128); chrome-extension: split into coding + opt-in release pack; stop generating drift-prone files (#155); Growth promote (2026-07-11): portable lessons into canon (#222); No pack is active by default — the basics pack (né universal) is declared explicitly (#232); Growth-promote: MV3 content-script/toolbar gotchas, non-PR CI read, AWS CLI access (#309); promote: chrome-extension UrlFilter host operators are raw string matches (#319); Vendored-mount surface shrink: engine/ consolidation, skills into packs, no CI stub, minimal CLAUDE.md + .gitignore (#384); Consolidate #453 / #441 / #434 / #437 / #456 / #447 into one PR (#462); Tighten every RULES.md to when + what + one non-obvious fact (#467); Pack badges: a mark per pack, and a README row bootstrap and baselining maintain (#525); prose-to-checks: add the deletion test and sweep the canon with it (#552); Pack manifest as the single source: routing guidance, skills, scoped rules (#555); chrome-extension: convert the classic-content-script rule to a check (#578); Versioned updates Phase 0: version scaffolding (#769) |
