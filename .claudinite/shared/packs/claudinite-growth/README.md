# claudinite-growth

Opt into the **growth lifecycle** - declaring this pack enrolls a repo in contributing its
hard-won lessons up to the shared Claudinite canon, and in pruning its local packs once the canon
owns them. Seeded by default, and opt-out by removal: the update flows never re-add it.

This pack carries the **repo-side** stages: capturing a repo's own lessons into its local packs,
and pruning them once the shared canon covers them. The central **promote** stage is a home-only
duty that runs canon-side, so it lives outside this pack.

Its scheduled work is four tasks under this pack's own `tasks/`, each discovered by the repo's
scheduler (`packs/claudinite-tasks/discover.mjs`) wherever the pack is declared:

| Task | Runs when | Where it lands |
|---|---|---|
| `growth-extract` ([tasks/growth-extract/task.md](tasks/growth-extract/task.md)) | the project changed in the window | the repo's own local packs, via a PR that auto-merges after CI |
| `growth-dedup` ([tasks/growth-dedup/task.md](tasks/growth-dedup/task.md)) | weekly, when the canon or the project's local packs moved in the week | the repo's own local packs, via a PR that auto-merges after CI |
| `prose-to-checks-sweep` ([tasks/prose-to-checks-sweep/task.md](tasks/prose-to-checks-sweep/task.md)) | weekly (no-ops cheaply on a quiet corpus) | a PR converting always-testable pack prose into checks |
| `rule-revalidation` ([tasks/rule-revalidation/task.md](tasks/rule-revalidation/task.md)) | weekly | corrections to rules whose environment claim no longer probes true, in the repo's own local packs |

(Plus `logs-prune`, agentless and on request only - retention over the conversation-logs branch,
[tasks/logs-prune/worker.mjs](tasks/logs-prune/worker.mjs). The hourly
[usage-fold](../claudinite-tasks/tasks/usage-fold/README.md) reads that same branch and is
described below, but it is the claudinite-tasks pack's task, not this one's.)

## Extraction is one task over two sources

`growth-extract` is the whole capture stage, and it runs **three skills** in order:

1. [extract-from-activity](skills/extract-from-activity/SKILL.md) over the window's commits, merged
   PRs and issue discussion;
2. [extract-from-conversations](skills/extract-from-conversations/SKILL.md) over the logs captured
   from working sessions;
3. [prose-to-checks](skills/prose-to-checks/SKILL.md) over the prose **that run just wrote**, to see
   whether any of it upgrades to a check before the PR opens.

Everything lands in **one** PR, delivered to land where the repo's delivery settings allow
(`packs/claudinite-tasks/src/deliver/deliver-pr.md`). The lesson bar and the promotion ladder both
halves share are [extracting-lessons.md](extracting-lessons.md). Because fresh prose is offered a
conversion the night it is written, the standing `prose-to-checks-sweep` is weekly: what it sees is
a backlog.

A member that wants the local stages without contributing lessons upstream **opts out of
promotion** on its own entry - `{ "id": "claudinite-growth", "config": { "promote": false } }`
- and the central promote stage skips it (absent or `true` = participate).

## The conversation lifecycle - capture in-session, extract in the task, retention

Capture needs the live session transcript, so it runs in-session; extraction only reads the
already-pushed logs, so it is the conversation half of the ordinary `growth-extract` task.

1. **Capture - a step in the merge-to-main skill.** Right after a merge lands:
   `node .claudinite/shared/packs/claudinite-growth/capture-log.mjs --pr <n>`
   (in the canon repo itself: `node packs/claudinite-growth/capture-log.mjs --pr <n>`), `<n>` the
   pull request the merge landed.
   It bundles the session transcript (sidechains inline, timestamp order), **scrubs
   enumeration-first** (every value the environment holds - `process.env` minus a short named
   allowlist of structural values, plus known credential stores - is redacted wherever it appears,
   with credential-shape patterns as the backstop), and pushes one file per **capture event** onto
   the orphan **`conversation-logs`** branch: `<stamp>--pr-<n>--<session>.jsonl`, commits marked
   `[skip ci]`. A capture no merge produced is keyed to an issue instead,
   `<stamp>--issue-<n>--<session>.jsonl`; every reader of the branch takes both spellings.
   **Delta-aware, keyed on the session id:** every capture pushes only the entries after this
   session's previous capture, whatever event produced it, so any two events chain into disjoint
   files and a zero delta pushes nothing at all.
   The branch is a **work queue, not an archive** - never merged.
1. **Capture - again, when the session ends** ([session-end.mjs](session-end.mjs), invoked by the
   engine's SessionEnd hook runner for every active pack that ships one). Same capture, with
   `--issue 0`: **`0` means "no associated issue"**, in the same filename shape the retention
   prune, the `conversationLogs` signal and the extract's filename parse read. **Best effort:** a
   container reclaimed by timeout never fires it, so nothing depends on it having run. An
   `issue-0` log has no PR or issue for the extract to post its summary on; nothing else about its
   lifecycle differs.
   **Unattended sessions capture through the same step, deliberately not through the hook.** A
   scheduled task's executor session ends by having its container reclaimed, which is exactly the
   ending no `SessionEnd` fires on - so the executor runs the engine's runner itself as its last
   step and names its work item in `CLAUDINITE_SESSION_ISSUE`, which this step uses in place of
   `0`.
2. **The pass - the conversation half of [growth-extract](tasks/growth-extract/task.md)**
   (precondition: a substantive merge; local git on the repo's working tree, MCP only for the
   provenance comment). It applies the
   [extract-from-conversations](skills/extract-from-conversations/SKILL.md) skill over
   [extracting-lessons.md](extracting-lessons.md)'s shared bar, routes keepers into the member's
   local packs, and posts on the worked PR or issue, for each rule that landed, a
   **200-word-max** summary of the slice of conversation that caused it.
   **Extraction is the only path to permanence**: a log that yields no rule gets no comment, and
   its conversation is gone once retention deletes it.
3. **Deletion - the agentless `logs-prune` task**
   ([tasks/logs-prune/worker.mjs](tasks/logs-prune/worker.mjs)), on request only, over the same
   branch: every capture past `config.retention_days` is removed, on the stamp in its filename
   alone. **An undeclared retention takes the pack's 10-day default**; `retention_days: 0` is the
   explicit capture-only opt-out, and a declaration the worker cannot read prunes nothing. There is
   no adoption question over it.

## Skill-usage metrics - what the mounted skills actually do

The [usage-fold](../claudinite-tasks/tasks/usage-fold/README.md) task counts skill loads **and
their denominators** (captures, merges, sessions, user messages, user commands) out of the logs
this pack captures, into `.claudinite/local/usage.GENERATED.json`: day rows recomputed statelessly
inside the raw retention window, week rows appended once past a `foldedThrough` watermark. The
question it answers is loads *against the sessions where that skill's own declared trigger
plausibly applied*. Zeros are implicit (a skill with no loads has no key), so "never loads" is read
by diffing the file against the repo's mounted skills. Check activations and failures are counted
beside them.

A canon curation session weighing a skill-versus-prose or a promotion call reads this file, per
repo or fleet-wide via the dashboard. Fleet-wide aggregation itself belongs to the fleet-enforcer
repo, the only place that knows who the members are.

## Usage review - was the placement right?

Every skill declares what usage it expects of itself, under its frontmatter `metadata.usage` -
`adoption`, `triggered` or `judgment`, each naming HOW it is reached rather than how often - and
[usage-review](tasks/usage-review/README.md) compares the declaration against the record daily,
by [`usage-rules.json`](usage-rules.json): rule declarations a person can read in a sitting,
evaluated by one generic evaluator. A local pack may add its own rules in the same vocabulary.

Each finding carries how well its **cause** is known, the causes in likelihood order with the
discriminator that tells each apart, and what a fix would likely be. The review changes nothing
and writes nothing outside its own file.

[usage-triage](tasks/usage-triage/README.md) is the one stage that changes anything: weekly, over
findings that have stood two weeks with a cause a diff can argue from, it opens one pull request
per subject carrying the edit itself, with automerge `nothing`. The same method over a canon's own
shelf is `claudinite-canon-curation`'s task of that name; both load
[triaging-usage-findings](skills/triaging-usage-findings/SKILL.md), which states the method and
names no corpus.

## Skills

Each stage's **method** lives in a skill, so the task doc frames the unattended run and the same
method is available to an owner asking in-session. A skill states the **action** and names no
corpus, so the canon-side twin of a stage loads the same skill and supplies its own. Extract's
three are listed above.

- [**growth-dedup**](skills/growth-dedup/SKILL.md) - the dedup stage's: what to prune, strip, or
  rephrase, the keep-test, and the shrink-only discipline.
- [**revalidating-rules**](skills/revalidating-rules/SKILL.md) - the revalidation stage's: what
  counts as a claim whose truth lives outside the repo, the two probe rules, and the four verdicts
  a run reports.
- [**writing-pack-prose**](skills/writing-pack-prose/SKILL.md) - how pack prose is *written*: the
  rule format, findability, and the slug marker that ends every rule and names its provenance file.
- [**changing-pack-elements**](skills/changing-pack-elements/SKILL.md) - forced on every pack file:
  which entry an edit owes, and how the pack's `README.md` stays about use.
- [**backfilling-provenance**](skills/backfilling-provenance/SKILL.md) - filling a pack's empty
  provenance files from its history.
- [**unattended-agents**](skills/unattended-agents/SKILL.md) - architecture and practice for
  unattended, automation-invoked agents.
- [**writing-tasks**](skills/writing-tasks/SKILL.md) - the contract a `tasks/<name>/task.json` and
  its worker are written to: the declaration's fields, the code-work and agentic phases, the
  precondition as the only place a task may decide not to run, and how a work item converges. It is
  what the task checks below judge against.
- [**learning-a-technology**](skills/learning-a-technology/SKILL.md) - the method for teaching a
  repo a technology nobody there has used, for a job of its own: the egress probe that settles
  whether the vendor was actually read, the split between the technology skill and the task beside
  it, and the three checks that keep such a skill liftable.
- [**extract-from-instructions**](skills/extract-from-instructions/SKILL.md) - routing rules
  somebody already wrote, a repo's `CLAUDE.md` or a person's machine-local one, to their owner and
  onto a rung above prose. Reach for it when a repo adopting Claudinite already carries a
  `CLAUDE.md`; `adopt-claudinite` offers it during the adoption interview.

`provenance.mjs` beside this README is the tool the three provenance skills name - `mark`,
`append`, `check`, `convert-references`, `reduce`, `history`, and the backfill's `brief` and
`apply` - and `provenance-integrity` and `provenance-change-recorded` below are the convention's
machine halves.

## Rules (`RULES.md`)

| Rule | Severity | Reason | Enforcement |
|---|---|---|---|
| Recording a local pack change | high | complexity | prose: <100 words |
| Wanting a job to run in Actions | high | complexity | prose: <100 words + check (`scheduler-workflow-shape`) |
| A task writes only local packs | high | correctness | prose: <50 words + check (`growth-write-scope`) |
| Describing another pack's artifact | medium | complexity | prose: <50 words |

## Coded rules

| Rule | Kind | What |
|---|---|---|
| `dedup-prune-integrity` | work-scope ([dedup-integrity.mjs](workRules/dedup-integrity.mjs)) | a dedup edit only removes portable text — never grows a local pack or re-imports a canon rule |
| `growth-write-scope` | work-scope ([growth-write-scope.mjs](workRules/growth-write-scope.mjs)) | a growth run (extract, dedup, either sweep) writes only the repo's own local packs |

Every run this pack schedules writes the local packs and nothing else. `growth-write-scope` is the
machine guarantee behind that, keyed on those runs' pinned commit titles; the same actions over a
canon's `packs/` shelf are `claudinite-canon-curation` tasks, titled so this gate reads them as
somebody else's business.

## Rules expire when the environment moves - revalidation

[rule-revalidation](tasks/rule-revalidation/task.md) is the weekly re-probe. It takes **every**
environment-dependent claim in the capture surface - a claim about the harness, a token's reach, an
MCP tool's existence - **runs** the smallest read-only thing that would distinguish true from false
for each, and corrects what the probe contradicts, in a PR whose body carries the probe evidence,
since that is the one thing a reviewer cannot re-derive from the diff. Covering the whole set every
run is what lets the task hold no state between runs.

Its scope is `.claudinite/local/packs/`, the same corpus `prose-to-checks-sweep` works and the only
one this pack ever writes; a canon pack's environmental claims are re-probed on the shelf that
publishes them, by `claudinite-canon-curation/canon-rule-revalidation`, through the same
[revalidating-rules](skills/revalidating-rules/SKILL.md) skill.

A probe that cannot run is logged **unprobed** and the rule is left untouched, reported in the
run's PR body as explicitly as a corrected one.

## Identifying a project's capture surface: its local packs

Every growth stage operates on a project's **local packs** - the tracked packs a repo keeps under
`.claudinite/local/packs/<pack>/` (prose in `RULES.md`, checks in the pack's `rules`, activity
procedures as the pack's skills, scheduled tasks under its `tasks/`). That subtree **is** the
project's own content; the rest of `.claudinite/` is the read-only mounted canon and is never a
capture, prune, or promote target. A repo with no local packs yet simply has nothing to extract or
dedup here; adoption seeds the structure.

Prefer the strongest mechanism the lesson allows - the **local promotion ladder**, applied at the
project's own level: a deterministic rule becomes a **check** whose failure message carries the
lesson (a **declared** one in the owning pack's `declared-checks.json` wherever patterns over files
can say it, a **rule module** in its `rules` only where they cannot), an activity-scoped procedure
becomes a **pack skill**, and only what none of those can carry lands as **prose** in a pack's
`RULES.md`.

The stages differ only in *how they read that set*, never in *which set it is*: extract and dedup
run against the member repo and read the local packs from the working tree; promote runs centrally
and reads the same subtree over the GitHub API.

## Checks

| Check | Severity | Reason | Enforcement |
|---|---|---|---|
| `dedup-prune-integrity` | high | correctness | check: blocking |
| `doc-pointers-resolve` | high | correctness | check: blocking |
| `growth-write-scope` | high | correctness | check: blocking |
| `task-worker-restores-main` | high | correctness | check: blocking |
| `legacy-check-spellings` | low | complexity | check: advisory |
| `in-session-github-access` | high | correctness | check: blocking |
| `technology-skill-cites-dated-sources` | high | correctness | check: blocking |
| `technology-skill-links-inside-its-folder` | medium | complexity | check: blocking |
| `technology-skill-code-imports-inside-its-folder` | medium | complexity | check: blocking |
| `provenance-integrity` | high | correctness | check: blocking |
| `provenance-change-recorded` | high | correctness | check: blocking |
| `routine-structure` | medium | complexity | check: blocking |
| `task-declaration-matches-folder` | high | correctness | check: blocking |
| `task-md-only-when-agentic` | high | correctness | check: blocking |
| `task-phase-discipline` | medium | complexity | check: advisory |
| `check-ships-with-test` | high | correctness | check: blocking |

The last five are the **task contract** ([the writing-tasks skill](skills/writing-tasks/SKILL.md)).
Relevance-first: all five are inert until the repo carries a `tasks/<name>/task.json` of its own.

- `task-declaration-matches-folder` - a declaration disagrees with its folder: discovery drops it into `errors` and every run keeps reporting healthy without it.
- `task-md-only-when-agentic` - an agentless task carries a `task.md`, which the corpus reads as "an agent runs here": prose no session will ever open, judged by the routine contract and named by every work item as the file the run is about.
- `task-phase-discipline` - a task decides not to run after its precondition already said run, hiding the decision from the run records.
