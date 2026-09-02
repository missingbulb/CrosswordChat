# Version history

Records for `packs/chrome-extension/pack.mjs`'s `version` field, one row per bump — added going forward from
the version this file was introduced beside (60821.1); earlier bumps are not backfilled.

| Version | Date | What changed |
|---|---|---|
| 60902.1 | 2026-09-02 | `store-release` converts to `preconditions: ['manifest-ahead || substantive-change']`, with the unreleased-bump comparison as a task-local term in `preconditions.mjs` beside the declaration. The shipping probe leaves the trigger entirely: whether a repo ships the Chrome Web Store pipeline is a fact adoption settled, so a repo that only CODES an extension names `chrome-extension/store-release` in its `taskScheduler.disabledTasks` instead of paying the question nightly (#1578). |
| 60901.1 | 2026-09-01 | The pack adopts the references convention: `references.md` records `declarative-content-set-icon`'s silent-`path` finding (#777), for the revalidation pass to reaffirm against a current Chrome (#1564). |
| 60824.1 | 2026-08-24 | Prose and tests name the scheduler at its new home in the `claudinite-tasks` pack (#1317). |
| 60823.1 | 2026-08-23 | Its release skill names the member settings file by its current name (#1252). |
| 60822.1 | 2026-08-22 | The manifest stops restating its own tree (#1246): `id`, `prose`, `badge`, `skills`, `worldRules` and `workRules` are resolved from the pack directory and an absent `detect`/`marker` means no fingerprint. Coded rules move into `worldRules/`/`workRules/` and tests into `test/`, which no vendor set ships. `minEngineVersion` rises to the engine release that reads all of it. |
