# spec-driven-product pack

A project-class pack (prose-only, declared — no fingerprint) for the recurring class: build and ship a
small end-user product against an executable spec — every requirement a numbered leaf claimed by
exactly one right-kind proof, expected results owner-owned, releases automatic while `main` is green.
Its enforcement deliberately lives inside the declaring project (the committed coverage gate and
allowlist the playbook requires), so the pack itself ships no checks; the sections are loop and
judgment, kept as prose.

Distilled from the two worked examples of the class in the owner's fleet:
missingbulb/GoogleCalendarEventCreator's executable-requirements methodology (`dev/requirements/` —
the origin) and missingbulb/TLDR's adaptation of it (`dev/requirements/`,
`dev/docs/ui-testing-guideline.md`, which adds the cross-tier server kind). The general test-trust
rules both build on are corpus canon in [the writing-tests skill](../basics/skills/writing-tests/SKILL.md)
and are pointed to, not restated.

## Prose (`RULES.md`) — by section

| Section (≤5 words) | How enforced |
|---|---|
| Executable spec is the backbone | prose (+ the project's doc-first gate) |
| One leaf, one right-kind proof | prose (+ the project's coverage gate) |
| Expecteds are owner-owned | prose (in-flight judgment; re-baseline mechanics in writing-tests) |
| State once, prove enforcing boundaries | prose |
| Supported-targets matrix is spec | prose (+ the project's committed samples) |
| Green means claimed, track gap | prose (+ the project's committed allowlist) |
| Owner reviews the product surface | prose |
| Ship automatically on green `main` | prose (mechanics: the platform's release pack) |
