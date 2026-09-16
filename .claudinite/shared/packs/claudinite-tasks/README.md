# claudinite-tasks — scheduled work

Everything whose subject is task work: the work-item queue, the executor, the task contract and
its signals, calendar/anchor math, run records, code-work, and the delivery lane a task's output
lands through. Declaring this pack is what gives a repo scheduled work; a repo that does not
declare it runs none, which is a supported state rather than a degraded one.

The mechanism itself — the state machine, the generator, the executor's protocol, urgency and
forcing, recovery — is the canon's own tasks-dispatch design document, and authoring a task is the
`writing-tasks` skill's subject. This file is the pack's own map.

## Layout

Every module sits in the ROLE it plays, and the graph between the roles is
one-directional. `contract/` and `items/` are what everything agrees on and name no
stage; `world/` holds the only modules that reach outside the run; the stages sit on
top of those and never import each other sideways or upwards. The `tasks-stage-barriers`
and `tasks-world-edges-live-in-world` checks are what hold the shape.

| Path | The role |
|---|---|
| `src/contract/` | what a task DECLARES and what its declaration means: the declaration's shape and defaults, the term vocabulary and the precondition seam every caller asks through, cadence and anchor arithmetic, the auto-merge policy engine, the commit trailer, task discovery, dormancy |
| `src/items/` | the work item as DATA: the title grammar that is its identity, the outcome/status decode over its labels, lease state, the queue listings, the run record, the pick order over the open queue, the tracker issue |
| `src/world/` | the only outward edges, each a named port — `github.mjs` (every REST path this pack calls, as a named operation), `actions.mjs` (the runner's environment) with `hold.mjs` and the three env bags beside it, `sessions.mjs` (the routine fire that starts an agent), `git.mjs`, `processes.mjs`, `clock.mjs` |
| `src/signals/` | the collectors a precondition is handed, read through the ports and described in the contract's terms |
| `src/schedule/` | the tick: which declared tasks have a window open, and the items filed for them |
| `src/execute/` | the executor: claiming a ready item, running its code-work, handing it to an agent session |
| `src/session/` | what runs INSIDE a work-item session: converging the item, verifying its outcome, the exec record, dispatch resolution, and the automerge verdict as a command |
| `src/deliver/` | turning a run's output into a landed pull request or a regenerated file |
| `src/recover/` | repair: the janitor's rules, workflow-failure escalation, the dead-run continuation |
| `src/adopt/` | what an adopting repo receives: the workflows converged from the stubs, the per-repo cron minute |
| `queue/` | `tasks/implement-request/` — the engine's own built-in task. Its `task.md` is a redirect kept for work items minted before the move (retired 2026-10-15); the spec itself is `public/implement-request.md` |
| `stubs/` | the two workflow files an adopting repo receives |
| `public/` | **everything outside this pack may reference** — the import surface, the commands a workflow or a doc runs, and the documents a routine reads. See below |
| `tasks/` | this pack's own tasks: `task-janitor` (the queue's sweeps), `usage-fold` (it folds this mechanism's run records and outcome labels), `tasks-usage-fold` (what the machinery itself cost — runs, billed minutes, API calls, outcomes, parks, latencies) and `verify-production` (coded production validations — URL probes judged as code-work) |
| `worldRules/` | the task-declaration checks |
| `workRules/` | the armed-auto-merge gate (`automerge-policy-scope`) |
| `declared-checks.json` | `tasks-pack-read-through-its-surface` — the guard over this pack's published surface, which runs wherever the pack is declared |
| `test/` | the unit suite, mirroring `src/`, and `test/sim/` — the simulator and its scenario suite, the mechanism's executable spec |
| `docs/PRINCIPLES.md` | the mechanism as claims, each citing the test that proves it |
| `src/deliver/deliver-pr.md` | the landing procedure every PR-delivering task's worker is pointed at, beside the lane it describes |

## `public/` — everything outside this pack may reference

One folder, one promise: **a name in `public/` does not move.** Everything a workflow runs, a
routine reads, another pack imports or a member's own local pack names lives here, and nothing
else of this pack is addressable from outside.

That promise is what the folder is for. A member's `.github/workflows/`, a routine's stored
prompt and a member's `.claudinite/local/packs/**` are all things this repository cannot
rewrite: a converge refreshes `.claudinite/shared/` and touches none of them. Every path any of
them names therefore has to be one that stays put, and `public/` is where those paths are kept.

Another pack's code may import `packs/claudinite-tasks/public/*` and nothing else of this pack;
the `pack-independence` barrier's allow list names that directory, and no other pack gains an
equivalent surface by existing.

### Commands and documents named from outside

| Path | What names it |
|---|---|
| `scheduler-run.mjs` | every member's `.github/workflows/claudinite-scheduler.yml` |
| `drain-dispatch.mjs` | the same workflow's post-scheduler drain |
| `workflow-failure.mjs` | the same workflow's failure-escalation job |
| `executor.mjs` | every member's `.github/workflows/claudinite-executor.yml` |
| `executor-continuation.mjs` | the same workflow's continuation job |
| `tick.mjs` | the retired scheduler entry, still named by workflows nobody has repointed |
| `create-work-item.mjs` | prose in members' own local packs — filing an item by hand, and waking a parked one |
| `converge-workflows.mjs` | the `adopt-pack` skill, run by an operator against a member checkout |
| `instructions.md` | a repo's work-item routine, as a stored prompt in its console settings |
| `implement-request.md` | the machine block of every issue adopted into the queue |

### Modules other packs import

**A member's own `.claudinite/local/packs/**` reads it the same way**, through its mount
(`.claudinite/shared/packs/claudinite-tasks/public/*`). That is the surface's whole point: the
nightly converge replaces `.claudinite/shared/` and may never touch a member's own packs, so an
import aimed anywhere else is one this repository cannot repair when the layout behind it moves.

| Module | What it publishes | Who reads it |
|---|---|---|
| `work-items.mjs` | the title grammar that is a work item's identity, the outcome/status decode over its labels, lease state, the pick order over the open queue, and whether a title is the scheduler's own dispatch issue rather than work | claudinite-dashboard, claudinite-fleet-sheepdog, a member's own packs |
| `anchors.mjs` | period length, and the instant a task's window last opened at or opens next | claudinite-dashboard |
| `wake.mjs` | which of a repo's declared tasks a scheduler run would instantiate an item for at a given instant — the plan a forced sweep has to predict | claudinite-fleet-sheepdog |
| `pull-requests.mjs` | how a merged pull request names the issue it closes, and how a span between two timestamps becomes hours | claudinite-dashboard |
| `delivery.mjs` | `landPr`, `deliverGenerated` — how a task's output becomes a landed PR or a regenerated file | any pack whose tasks deliver |
| `github.mjs` | the GitHub client, the workflow dispatch, the two workflow file names, and the tracker issue a worker records on | any pack whose tasks reach GitHub |
| `signals.mjs` | the signal shapes a precondition is handed | packs asserting what their own tasks will see |
| `task-contract.mjs` | task-declaration validation, and the signal union either precondition form resolves to | every pack with tasks, in its own tests |
| `preconditions.mjs` | the precondition vocabulary, the expression grammar, and both evaluators — the seam the executor calls at pick over a discovered task, and the raw-fields one a pack asserts its own declarations with | every pack with tasks, in its own tests |
| `merge-policy.mjs` | the auto-merge policy verdict (`automerge`, the `Merge:` field, the arming trailer) and the `merge-rules.json` compiler | any pack declaring policies or merge rules, in its own tests |
| `task-declaration.mjs` | the declaration as text — the reader that lifts its fields out and the agentic defaults the loader fills, reaching no Node built-in so a browser bundle can load it | claudinite-dashboard |
| `task-discovery.mjs` | where a task's declaration lives on disk and how it is read — kept apart from `task-declaration.mjs`, which reaches no Node built-in | a member's own worker needing its task's declared fields at run time |
| `usage-format.mjs` | the usage aggregate's codec | **nobody today** — held for the fleet-wide aggregator, which is not a task in the sheepdog pack at present; every live caller reads `src/items/usage-format.mjs` from inside this pack |
| `verification.mjs` | what a production-verification spec looks like, and the re-arm cadence a not-yet-live run reschedules on | basics, whose skill writes the spec this pack's probes read |
| `dormancy.mjs` | whether a repo's scheduler is dormant, by the same test the scheduler stops itself with | claudinite-dashboard, claudinite-fleet-sheepdog |
| `substantive-commit.mjs` | whether a commit was genuine project work rather than the machinery moving — the test a `commits`-gated precondition is decided by | claudinite-dashboard, for the fleet view's `sleepy` mark |

Each module publishes **named** exports, never `export *`: the list in the file IS the promise, so a
reader sees the whole surface in one place and an internal rename can neither widen nor narrow it.
A consumer needing something absent asks for the named export to be added here — never a deeper
import, which `tasks-pack-read-through-its-surface` refuses.

A pack whose **non-task** code reads any of these declares `requires: ['claudinite-tasks']`. A
pack's `tasks/` folder needs no declaration: a mount without this pack carries no `tasks/` at all,
since a task folder is inert without the queue that runs it.

## Adoption

The two workflow files and the routine endpoints cannot converge into place — `.github/workflows/`
is the one directory a member's nightly update may never write — so they are scaffolded once, at
adoption, by the `adopt-pack` skill. They are static from then on: the per-repo cron minute and
anchor hours are written once, secrets travel as one fixed line, and the `run:` lines name mount
pack paths behind which everything converges nightly.

## Checks

| Rule | Confidence | Dimension | Enforcement |
|---|---|---|---|
| `task-declaration-shape` | high | correctness | check: blocking |
| `task-code-work-env` | high | correctness | check: blocking |
| `automerge-policy-scope` | high | correctness | check: blocking |
| `legacy-task-fields` | low | complexity | check: advisory |
| `executor-workflow-secrets` | high | correctness | check: advisory |
| `tasks-pack-read-through-its-surface` | high | correctness | declared check: blocking |

`tasks-pack-read-through-its-surface` is this pack's, not the canon's, because the consumers that
can get it wrong are members: it scans a repo's own `packs/` **and** its `.claudinite/local/packs/`,
the tree no converge may rewrite, so a deep import written there is caught in that repo's own run
rather than when it crashes. Declared here so every repo declaring this pack runs it — a canon-only
pack would never reach them (missingbulb/Shepherd#613).

The first two are relevance-first — inert until the repo carries a `tasks/<name>/task.json` of its own; the third is self-gating on the branch's own arming trailer.

- `task-declaration-shape` — a task declaration the scheduler reads is incomplete or illegal — no `preconditions` saying when it runs, an unknown condition, an illegal value — so the task never fires or fires wrong.
- `task-code-work-env` — a task reads a `CLAUDINITE_*` variable code-work never sets, so a parameter (a scope filter, a dry-run switch) silently never arrives and the run goes green in its most dangerous mode.
- `executor-workflow-secrets` — the executor workflow does not pass a secret the tasks of this repo's packs declare, so the queue picks the item up and only the run finds out the secret is not there. The list is the tasks' alone; an invocation endpoint's `tokenSecret` is config, stamped by the converge and reported by the invocation call itself. Advisory because the remedy is a human-merged PR to `.github/workflows/`, the one fix a member's own machinery cannot make.
- `automerge-policy-scope` — a branch that stamped the `Claudinite-Automerge-Policy` trailer (its run intends to land its own PR) carries a diff its declared policy does not cover, which is exactly the unreviewed change the policy exists to stop.
