# executable-requirements pack

Active when the repo has `dev/requirements/requirements.md`. The concrete framework standard for
running a spec as tests: layout, case naming, the coverage gate's duties, the kind vocabulary
(including the storyboard `saga` kind), the machine-managed gallery, and the determinism rules that
make rendered expecteds byte-stable. Prose-only: every rule here is enforced by gates **the
declaring project itself commits** (coverage gate, gallery gate) — the pack standardizes what those
gates must check, not the checking.

Sits under [spec-driven-product](../spec-driven-product/README.md), which owns the judgment layer
(doc-first discipline, owner-owned expecteds, honest-gap tracking) — declare both for a product
project of that class. This pack exists so a *new* project (or a new stack) adopts the framework by
convention instead of re-deriving it.

Distilled from three worked implementations in the owner's fleet:
missingbulb/GoogleCalendarEventCreator (`dev/requirements/` — the origin: jsdom+satori rendering,
pixel-exact snapshots), missingbulb/TLDR (adds the cross-tier `server` kind), and
missingbulb/ShoutsAndWhispers (`dev/requirements/` — the Flutter port: golden-file rendering, the
fake-world harness, and the `saga` storyboard kind's first implementation).

## Prose (`RULES.md`) — by section

| Section (≤5 words) | How enforced |
|---|---|
| The layout is the contract | prose (+ the project's coverage gate) |
| What the coverage gate checks | prose (checklist the project's gate implements) |
| The kind vocabulary | prose |
| Sagas: stories as storyboards | prose (+ the project's saga runner) |
| Determinism or it isn't spec | prose (+ the project's harness) |
| Rendering recipes per stack | prose |
| The gallery is derived output | prose (+ the project's gallery gate) |
| Refresh is a review step | prose (judgment: spec-driven-product + writing-tests) |
