# Version history

Records for `packs/node/pack.mjs`'s `version` field, one row per version, newest first.
A version is cut on `main` after its changes land, so a row names the pull requests that
landed between the previous version and this one; the weekly history task writes the rows
a version is missing and leaves every row that already stands.

| Version | Date | What changed |
|---|---|---|
| 60903.1 | 2026-09-03 | The `node --test` discovery rule moves out of `RULES.md` into the `node-test-discovery` skill, forced for `.github/workflows/**` and `package.json`; the prose keeps the always-on module-resolution and jsdom rules (#1662). |
| 60902.1 | 2026-09-02 | `RULES.md` drops the descriptive framing the pack README already carries — the file carries rules only. |
| 60901.1 | 2026-09-01 | Recovers the rationale #467 cut from two rules into a new `references.md`; both jsdom claims are verified empirically against jsdom 30.0.1, including that `body.innerText` is `undefined` rather than `null` (#1571). |
| 60823.1 | 2026-08-23 | Names the member settings file by its current name in its config prose (#1252). |
| 60822.1 | 2026-08-22 | The manifest stops restating its own tree (#1246): `id`, `prose`, `badge`, `skills`, `worldRules` and `workRules` are resolved from the pack directory and an absent `detect`/`marker` means no fingerprint. Coded rules move into `worldRules/`/`workRules/` and tests into `test/`, which no vendor set ships. `minEngineVersion` rises to the engine release that reads all of it. |
| 60820.1 | 2026-08-20 | Engine and pack versions become date-anchored `<day>.<n>` (#1105) |
| 2 | 2026-08-18 | Index every pack's rules and checks with words, severity and reason (#915); Promote eleven fleet lessons into the canon (#853); Bump every pack whose content was edited without a version bump (#969) |
| 1 | 2026-08-12 | Context-relief architecture: packs (prose + checks) and skills, with enforcement (#128); flutter/node pack detect: match monorepo subdir markers (#185); Pack environment requirements: corpus-owned generic script, packs declare the rest (#204); No pack is active by default — the basics pack (né universal) is declared explicitly (#232); Pack-oriented declarations: pack entries carry config, rules, and acceptances (#279); node: earn-each-dependency check — convert the testable slice of the engineering-practices rule (#372); Vendored-mount surface shrink: engine/ consolidation, skills into packs, no CI stub, minimal CLAUDE.md + .gitignore (#384); Scope-split conformance checks: fluent work context, independent world/work runners (#393); Tighten every RULES.md to when + what + one non-obvious fact (#467); Pack badges: a mark per pack, and a README row bootstrap and baselining maintain (#525); Growth promote: 10 lessons from 7 members into the canon (#541); Pack manifest as the single source: routing guidance, skills, scoped rules (#555); Move engineering-practices from a skill into basics/RULES.md (#661); growth-promote: dedupe PR #740's rule additions and cut the language (#751); Versioned updates Phase 0: version scaffolding (#769) |
