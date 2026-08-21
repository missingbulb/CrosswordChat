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

| Rule | Severity | Reason | Enforcement |
|---|---|---|---|
| A requirement line | medium | complexity | prose: 42 words |
| A requirement line is a scannable one-liner | low | complexity | prose: 77 words |
| The folder is the kind. | medium | complexity | prose: 41 words |
| Artifact expecteds live beside their case | medium | complexity | prose: 66 words |
| surface snapshot | medium | correctness | prose: 33 words |
| behavior | medium | correctness | prose: 22 words |
| logic | low | correctness | prose: 12 words |
| saga | low | correctness | prose: 10 words |
| per-project kinds | low | complexity | prose: 41 words |
| heavy/e2e singleton | medium | performance | prose: 21 words |
| Strip dead delay, keep the animation. | medium | performance | prose: 49 words |
| Lossless, so byte-identity still holds. | high | correctness | prose: 70 words |
| Mark the gesture. | medium | correctness | prose: 30 words |
| Pin the clock. | high | correctness | prose: 26 words |
| Fake every nondeterministic input | high | correctness | prose: 31 words |
| Load real fonts | high | correctness | prose: 51 words |
| Never wait for "settled". | high | correctness | prose: 21 words |
| Browser-extension / DOM products | medium | correctness | prose: 58 words |
| Flutter | medium | correctness | prose: 91 words |

## Checks

| Check | Severity | Reason | Enforcement |
|---|---|---|---|
| `feature-requirements-first` | high | correctness | check: blocking |
