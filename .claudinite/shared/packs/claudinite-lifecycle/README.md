# core

Claudinite's own surface in a repo that runs it: the vendored mount, the declaration that activates a
pack, adopting Claudinite and adopting a pack, and the contract every scheduled task is written to.

**Mandatory.** `basics` `requires` this pack, so the closure vendors its content and materializes its
declaration wherever a declaration is written. Removing the entry is not an opt-out — it is drift, and `claudinite-lifecycle-declared`
reports it.

## Rules (`RULES.md`)

| Rule | Severity | Reason | Enforcement |
|---|---|---|---|
| Reading a rule that arrived from Claudinite | high | correctness | prose: <50 words + checks (`shared-tree-edit-guard`, `shared-tree-immutable`, `claudinite-isolation`) |
| Finding a mounted skill's real path | medium | complexity | prose: <100 words |
| Wanting a pack's rules to apply here | high | correctness | prose: <50 words + check (`claudinite-lifecycle-declared`) |
| Adding a pack | medium | complexity | prose: <50 words |
| Setting a project up on Claudinite | medium | complexity | prose: <20 words |
| Deciding which pack owns a lesson | medium | complexity | prose: <100 words |
| Judging whether Claudinite is current here | medium | correctness | prose: <100 words |
| Answering "why did the mount not update" | medium | correctness | prose: <50 words |
| A referenced file absent from the mount | medium | correctness | prose: <100 words |
| Judging canon's current behavior | high | correctness | prose: <200 words |
| An engine comment citing a design doc | low | complexity | prose: <100 words |
| A silent check run is clean | low | complexity | prose: <50 words |
| Verifying the Stop hook won't block you | medium | correctness | prose: <100 words |
| Pushing a change the world sweep scans | medium | complexity | prose: <50 words |

## Checks

Each of these asks the same kind of question: **is Claudinite working in this repo** — declared,
converged, gated, scheduled. A repo can fail any of them silently, which is why they are checks and
not prose: the session that has lost its rules is the session least able to notice.

| Check | Severity | Reason | Enforcement |
|---|---|---|---|
| `claudinite-lifecycle-declared` | critical | correctness | declared: blocking |
| `claudinite-isolation` | high | complexity | declared: blocking |
| `shared-tree-edit-guard` | high | correctness | declared: blocking |
| `shared-tree-immutable` | high | correctness | cn built-in: advisory |
| `seeded-file-stale` | high | correctness | cn built-in: advisory |
| `scheduler-workflow-shape` | high | correctness | declared: blocking |
| `skill-loaded-before-editing` | high | correctness | cn built-in: blocking |
| `skills-index-current` | medium | correctness | `cn verify` rule |
| `flat-declarations-current` | medium | correctness | cn built-in: blocking |

Where each one runs:

- **Inside `cn`.** `shared-tree-immutable`, `flat-declarations-current` and `seeded-file-stale`
  (and the adoption skills' two below) are `cn` built-ins tagged with this pack: they run only
  where the pack is declared and list under it in `cn check list`; the pack carries no code for
  them. `skill-loaded-before-editing` is a `cn` built-in on every member.
- **Declared.** `claudinite-lifecycle-declared`, `claudinite-isolation`, `shared-tree-edit-guard`
  and `scheduler-workflow-shape` are this pack's `declared-checks.json`.
- **Answered by `cn verify`, no longer checks here.** `rules-index-current` (verify's
  `rules-index-current` and `claude-md-import`), `skills-index-current` (verify's rule of that
  name: an index missing a skill a declared pack holds breaks, a missing index is a deprecation), `conformance-workflow` and
  `conformance-work-scope` (verify's `member-workflows`, against the engine's CI template, which
  runs `cn check world` over the change on every pull request), and `legacy-shape-in-use` (verify's
  `settings-checks` deprecations and `min-engine-version-legacy`).

What goes wrong when one fires:

- `claudinite-lifecycle-declared` — this pack's entry is gone from `packs.declared` in `.claudinite/settings.*`, so none of the rules above run and the session cannot tell.
- `claudinite-isolation` — the repo's own code reaches into `.claudinite/`, so the next canon refactor is a breaking migration for code the canon does not own (a declared `forbidReferences` barrier edge).
- `adoption-answers-pending` — the branch declares a pack whose question its entry has no answer for; ask the owner and record it with `cn settings answer`.
- `interview-answer-stale` — an entry stores an answer to a question its pack no longer asks.
- `seeded-file-stale` — a file some pack seeded at adoption has fallen behind that pack's template, and since a seeded file is never converged nothing else would ever say so: the member goes on running a copy whose pack has moved.
- `scheduler-workflow-shape` — the scheduler's cron, concurrency or dispatch guard has drifted, or it no longer runs `cn schedule run`: staggering, double-run safety or manual runs break.
- `flat-declarations-current` - `.claudinite/cache/tasks.GENERATED.json` no longer matches a declared pack's `task.json`, so the dashboard and a session asking what runs here read a roster that is not the repo's. Regenerate with `cn tasks flat --write`; every converge `cn` runs writes it beside the rules index.

The **task contract** and its checks are deliberately NOT here. Those ask whether a task is
*written* correctly, which is authoring; every check above asks whether Claudinite is *working* in
this repo. They live with the rest of the authoring surface.

The scope cuts the other way too: a rule about how the **canon's own** content is maintained is not
this pack's, however much it looks like one.

`skill-loaded-before-editing` is the Stop-time half of **path-scoped skills**: a skill names
the files it must be loaded for under `force-load-on-file-edits-paths` in its SKILL.md frontmatter
`metadata` (the harness's own `paths` is a limiter on when it offers a skill, so it cannot carry
this), the engine's PreToolUse guard holds a file tool aimed there until the session has
loaded that skill, and this rule catches the edits the guard never saw (a `sed`, a heredoc) by
asking the diff the same question. A load is a `Skill` tool call or a `Read` of the skill's own
SKILL.md. Every converge `cn` runs writes `.claudinite/cache/claudinite-skills.GENERATED.md` beside
the rules index — every mounted skill with what loads it, the scoped ones first, and no file when
no declared pack bundles a skill — and `skills-index-current` keeps it naming what the declared
packs actually bundle.

## Skills

| Skill | For |
|---|---|
| [`adopt-claudinite`](skills/adopt-claudinite/SKILL.md) | setting a project up on Claudinite for the first time: `cn init`, its questions recorded with `cn settings answer`, the executor routine, one pull request and the HANDOVER issue |
| [`adopt-pack`](skills/adopt-pack/SKILL.md) | adding packs to a repo that already runs Claudinite: `cn adopt`, the interview, scaffolding, the HANDOVER issue, landing |

Two more checks of the same kind judge the answers a member stores against each declared pack's
questions; both are `cn` built-ins tagged with this pack:

| Check | Severity | Reason | Enforcement |
|---|---|---|---|
| `adoption-answers-pending` | medium | complexity | cn built-in: blocking (work) |
| `interview-answer-stale` | low | complexity | cn built-in: advisory |

## Tasks

| Task | when it runs | Runs when |
|---|---|---|
| `adopt-requested-packs` | never — no `preconditions`; only from the item the fleet places | the repo carries an open pack-adoption request |

The per-repo update is not this pack's: the engine contributes it as its own `engine/update` task.
This pack is marked `"engine": true` in `pack.json`, so the executor runs its tasks as the engine's own, under the license.
