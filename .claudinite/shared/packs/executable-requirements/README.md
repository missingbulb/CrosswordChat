# executable-requirements pack

Active when the repo has `dev/requirements/requirements.md`. The concrete framework standard for
running a spec as tests: layout, case naming, the coverage gate's duties, the kind vocabulary
(including the storyboard `saga` kind), the machine-managed gallery, and the determinism rules that
make rendered expecteds byte-stable. Prose-only: every rule here is enforced by gates **the
declaring project itself commits** (coverage gate, gallery gate) — the pack standardizes what those
gates must check, not the checking.

The judgment layer above it — doc-first discipline, owner-owned expecteds, honest-gap tracking —
is not here. This pack exists so a *new* project (or a new stack) adopts the framework by
convention instead of re-deriving it.

Distilled from three worked implementations in the owner's fleet:
missingbulb/GoogleCalendarEventCreator (`dev/requirements/` — the origin: jsdom+satori rendering,
pixel-exact snapshots), missingbulb/TLDR (adds the cross-tier `server` kind), and
missingbulb/ShoutsAndWhispers (`dev/requirements/` — the Flutter port: golden-file rendering, the
fake-world harness, and the `saga` storyboard kind's first implementation).

## Rules (`RULES.md`)

The always-on rules — the layout every case lands in, the gallery and the refresh lane:

| Rule | Severity | Reason | Enforcement |
|---|---|---|---|
| The folder is the kind. | medium | complexity | prose: 41 words |
| Artifact expecteds live beside their case | medium | complexity | prose: 22 words |

Everything an author needs while *writing* a leaf or a case lives in the skills below: the
leaf-line convention and the kind vocabulary in `write-a-requirement-leaf`, the storyboard and
animated-golden rules in `write-a-saga`, the determinism rules and the per-stack rendering recipes
in `deterministic-expecteds`. Each forces itself for the files it governs, so the PreToolUse guard
holds an edit there until the session has loaded it.

## The mechanism the project's gates enforce

- **Requirement lines** are parsed with one shared regex (`` ^\s*(?:-\s+)?`(\d+(?:\.\d+)+)` ``)
  so specs stay drop-in compatible across projects.
- **The coverage (bijection) gate** is one committed test. It must fail on every one of: a leaf
  no case claims (doc-first red-by-default); a case claiming a non-existent leaf; two cases
  claiming one leaf; a misnamed case file; a kind directory absent from the registry (or a
  registered kind with no directory); a manifest out of sync with disk (where manifests exist);
  an image found in a coded kind's folder (a screenshot cannot verify a gesture or a pure rule);
  a stray golden no case or step accounts for. Every rule iterates the registry — adding a kind
  never edits the gate.
- **The registry.** Where the language discovers cases dynamically (Node `require`), the
  registry walks the folders; where it cannot (Dart/Flutter), each kind keeps a hand-written
  `manifest` and the gate enforces manifest ⇄ disk equality — an unregistered case file never
  runs, so unregistered must be red.
- **The ordering** an interactive feature run also has, which `feature-requirements-first`
  checks: after the owner's feature-classified comment, an independent commit updating the spec
  (no code alongside) precedes the first code commit on the branch. The spec's path defaults to
  the canonical `dev/requirements/requirements.md`; a project whose spec lives elsewhere (a
  non-canonical layout, or the pack pulled in via a `requires` from `spec-driven-product`) names
  it on the pack entry as `config.spec`.

## Checks

| Check | Severity | Reason | Enforcement |
|---|---|---|---|
| `feature-requirements-first` | high | correctness | check: blocking |

## Skills

| Skill | Trigger |
|---|---|
| [`write-a-requirement-leaf`](skills/write-a-requirement-leaf/SKILL.md) | any edit of `dev/requirements/requirements.md` — held by the guard until loaded |
| [`write-a-saga`](skills/write-a-saga/SKILL.md) | any edit under `dev/requirements/saga/` — held by the guard until loaded |
| [`deterministic-expecteds`](skills/deterministic-expecteds/SKILL.md) | any edit of a case (`dev/requirements/**/cases/**`) or of `dev/requirements/shared/` — held by the guard until loaded |
