# Version history

Records for `packs/executable-requirements/pack.mjs`'s `version` field, one row per bump — added going forward from
the version this file was introduced beside (60820.1); earlier bumps are not backfilled.

| Version | Date | What changed |
|---|---|---|
| 60902.1 | 2026-09-02 | `RULES.md` drops the descriptive framing the pack README already carries — the file carries rules only. |
| 60822.1 | 2026-08-22 | The manifest stops restating its own tree (#1246): `id`, `prose`, `badge`, `skills`, `worldRules` and `workRules` are resolved from the pack directory and an absent `detect`/`marker` means no fingerprint. Coded rules move into `worldRules/`/`workRules/` and tests into `test/`, which no vendor set ships. `minEngineVersion` rises to the engine release that reads all of it. |
| 60903.1 | 2026-09-03 | The leaf-line convention and kind vocabulary move into the `write-a-requirement-leaf` skill (forced for `dev/requirements/requirements.md`), sagas into `write-a-saga` (forced for `dev/requirements/saga/**`), determinism and the per-stack rendering recipes into `deterministic-expecteds` (forced for `dev/requirements/**/cases/**` and `dev/requirements/shared/**`); the describe-only mechanism prose (line regex, gate inventory, registry enforcement) moves to the README, and `RULES.md` shrinks to the always-on layout, gallery and refresh rules (#1662). |
