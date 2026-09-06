# Version history

Records for `packs/executable-requirements/pack.mjs`'s `version` field, one row per version, newest first.
A version is cut on `main` after its changes land, so a row names the pull requests that
landed between the previous version and this one; the weekly history task writes the rows
a version is missing and leaves every row that already stands.

| Version | Date | What changed |
|---|---|---|
| 60903.1 | 2026-09-03 | The leaf-line convention and kind vocabulary move into the `write-a-requirement-leaf` skill (forced for `dev/requirements/requirements.md`), sagas into `write-a-saga` (forced for `dev/requirements/saga/**`), determinism and the per-stack rendering recipes into `deterministic-expecteds` (forced for `dev/requirements/**/cases/**` and `dev/requirements/shared/**`); the describe-only mechanism prose (line regex, gate inventory, registry enforcement) moves to the README, and `RULES.md` shrinks to the always-on layout, gallery and refresh rules (#1662). |
| 60902.1 | 2026-09-02 | `RULES.md` drops the descriptive framing the pack README already carries — the file carries rules only. |
| 60822.1 | 2026-08-22 | The manifest stops restating its own tree (#1246): `id`, `prose`, `badge`, `skills`, `worldRules` and `workRules` are resolved from the pack directory and an absent `detect`/`marker` means no fingerprint. Coded rules move into `worldRules/`/`workRules/` and tests into `test/`, which no vendor set ships. `minEngineVersion` rises to the engine release that reads all of it. |
| 60820.1 | 2026-08-20 | Engine and pack versions become date-anchored `<day>.<n>` (#1105) |
| 3 | 2026-08-19 | Collapse chrome-extension-release into chrome-extension, and stop packs discussing each other (#1060) |
| 2 | 2026-08-18 | Index every pack's rules and checks with words, severity and reason (#915); Bump every pack whose content was edited without a version bump (#969) |
| 1 | 2026-08-12 | Add executable-requirements pack; fill the flutter pack stub (#165); executable-requirements: capture the animated saga golden (APNG) variant (#206); No pack is active by default — the basics pack (né universal) is declared explicitly (#232); Interactive-comment routing: three-mode prose + conversation-surface checks (#311); feature-requirements-first: resolve the spec path, self-skip when absent (#338); google-identity: prose → skill-owned checks, enforcement-silent canon docs, shared line-scanning lib (#350); Vendored-mount surface shrink: engine/ consolidation, skills into packs, no CI stub, minimal CLAUDE.md + .gitignore (#384); Scope-split conformance checks: fluent work context, independent world/work runners (#393); Tighten every RULES.md to when + what + one non-obvious fact (#467); Pack adoption: interview-in-manifest, adopt-pack skill, enforcing check (#401); Pack badges: a mark per pack, and a README row bootstrap and baselining maintain (#525); Pack manifest as the single source: routing guidance, skills, scoped rules (#555); Versioned updates Phase 0: version scaffolding (#769) |
