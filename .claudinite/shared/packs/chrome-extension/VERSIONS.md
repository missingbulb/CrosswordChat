
Records for `packs/chrome-extension/pack.mjs`'s `version` field, one row per bump — added going forward from
the version this file was introduced beside (60821.1); earlier bumps are not backfilled.

| Version | Date | What changed |
|---|---|---|
| 60903.4 | 2026-09-03 | The tolerated `@main` advisory names the convergence window its tolerance ends on rather than a census of repos still making those calls (#1652). |
| 60903.3 | 2026-09-03 | The pre-vendoring `@main` orchestrator shape now reports an advisory while the vendoring migration is live instead of returning silently: the tolerance's removal is gated on no repo still making those calls, and a repo that is never told it makes them is what holds that gate shut (#1637). |
| 60903.1 | 2026-09-03 | A skill's `SKILL.md` opens on what to do, not on what the skill is: the self-describing framing and the pointers to prose the reader already holds are gone. |
| 60903.2 | 2026-09-02 | `RULES.md` drops the descriptive framing the pack README already carries — the file carries rules only. |
| 60902.1 | 2026-09-02 | `store-release` converts to `preconditions: ['manifest-ahead || substantive-change']`, with the unreleased-bump comparison as a task-local term in `preconditions.mjs` beside the declaration. The shipping probe leaves the trigger entirely: whether a repo ships the Chrome Web Store pipeline is a fact adoption settled, so a repo that only CODES an extension names `chrome-extension/store-release` in its `taskScheduler.disabledTasks` instead of paying the question nightly (#1578). |
| 60901.1 | 2026-09-01 | The pack adopts the references convention: `references.md` records `declarative-content-set-icon`'s silent-`path` finding (#777), for the revalidation pass to reaffirm against a current Chrome (#1564). |
| 60824.1 | 2026-08-24 | Prose and tests name the scheduler at its new home in the `claudinite-tasks` pack (#1317). |
| 60823.1 | 2026-08-23 | Its release skill names the member settings file by its current name (#1252). |
| 60822.1 | 2026-08-22 | The manifest stops restating its own tree (#1246): `id`, `prose`, `badge`, `skills`, `worldRules` and `workRules` are resolved from the pack directory and an absent `detect`/`marker` means no fingerprint. Coded rules move into `worldRules/`/`workRules/` and tests into `test/`, which no vendor set ships. `minEngineVersion` rises to the engine release that reads all of it. |
| 60902.2 | 2026-09-02 | Task declarations converted to `task.json`; the declaration's comments moved into each task's README (#1633). |
| 60903.5 | 2026-09-03 | `chrome-store-releases` forces itself for `.github/release.config` and the vendored `chrome-extension-*` workflows (`force-load-on-file-edits-paths`) (#1648): the guard holds an edit there until the skill is loaded. |
