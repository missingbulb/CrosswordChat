# Version history

Records for `packs/web-speech/pack.mjs`'s `version` field, one row per version, newest first.
A version is cut on `main` after its changes land, so a row names the pull requests that
landed between the previous version and this one; the weekly history task writes the rows
a version is missing and leaves every row that already stands.

| Version | Date | What changed |
|---|---|---|
| 60904.1 | 2026-09-04 | Six pack-level checks on the API contracts, promoted with their prose from CrosswordChat's `local/browser-speech`: mic release and constraints, the error-map default, interim-result gating, recognizer terminal handlers and TTS settle. Two rules join them — interim results as a signal rather than input, and the application-level guard for your own spoken output — plus the preflight-when-already-granted clause and voice order and rate as settings. |
| 60903.1 | 2026-09-03 | A skill's `SKILL.md` opens on what to do, not on what the skill is: the self-describing framing and the pointers to prose the reader already holds are gone. |
| 60902.1 | 2026-09-02 | `RULES.md` drops the descriptive framing the pack README already carries — the file carries rules only. |
| 60901.1 | 2026-09-01 | Recovers the rationale #467 cut from two rules into a new `references.md` — where n-best recovery lives, and why the cycle settles once (#1571). |
| 60822.1 | 2026-08-22 | The manifest stops restating its own tree (#1246): `id`, `prose`, `badge`, `skills`, `worldRules` and `workRules` are resolved from the pack directory and an absent `detect`/`marker` means no fingerprint. Coded rules move into `worldRules/`/`workRules/` and tests into `test/`, which no vendor set ships. `minEngineVersion` rises to the engine release that reads all of it. |
| 60820.1 | 2026-08-20 | Engine and pack versions become date-anchored `<day>.<n>` (#1105) |
| 3 | 2026-08-19 | Collapse chrome-extension-release into chrome-extension, and stop packs discussing each other (#1060) |
| 2 | 2026-08-18 | Declarative pattern-check engine: one shared pass, checks declared as data (#790); Pattern-check engine: self-describing spec keys, and the cross-file tree assertions (#800); Declared checks are JSON, one file per pack (#827); Declarative checks: review document + the implementation it recommends (#839); The remaining conversion tranches: work scope, and files named by a parsed field (#908); Index every pack's rules and checks with words, severity and reason (#915); Bump every pack whose content was edited without a version bump (#969) |
| 1 | 2026-08-12 | web-speech pack: browser voice I/O — 2 skill-owned checks + runtime-gotcha prose (#346); web-speech: check-the-world for mic capture released on pagehide (#362); Vendored-mount surface shrink: engine/ consolidation, skills into packs, no CI stub, minimal CLAUDE.md + .gitignore (#384); Tighten every RULES.md to when + what + one non-obvious fact (#467); Pack badges: a mark per pack, and a README row bootstrap and baselining maintain (#525); Pack manifest as the single source: routing guidance, skills, scoped rules (#555); Versioned updates Phase 0: version scaffolding (#769) |
