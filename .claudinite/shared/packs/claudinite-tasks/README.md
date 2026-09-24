# claudinite-tasks — scheduled work

Everything whose subject is task work: the work-item queue, the executor, the task contract and
its signals, calendar/anchor math, run records, code-work, and the delivery lane a task's output
lands through. Declaring this pack is what gives a repo scheduled work; a repo that does not
declare it runs none, which is a supported state rather than a degraded one.

The mechanism itself, from the state machine and the generator to the executor's protocol,
urgency, forcing and recovery, is [`docs/PRINCIPLES.md`](docs/PRINCIPLES.md); authoring a task is
the `writing-tasks` skill's subject. This file is the pack's own map.

## Layout

Every module sits in the ROLE it plays, and the graph between the roles is
one-directional. `contract/` and `items/` are what everything agrees on and name no
stage; `world/` holds the only modules that reach outside the run; the stages sit on
top of those and never import each other sideways or upwards. The `tasks-stage-barriers`
and `tasks-world-edges-live-in-world` checks are what hold the shape.

| Path | The role |
|---|---|
| `src/contract/` | what a task DECLARES and what its declaration means: the declaration's shape and defaults, the term vocabulary and the precondition seam every caller asks through, cadence and anchor arithmetic, the auto-merge policy engine, task discovery, dormancy |
| `src/items/` | the work item as DATA, over the vocabulary and grammar `public/` defines: the queue listings, the run record, the pick order over the open queue, the heartbeat |
| `src/world/` | the only outward edges, each a named port — `github.mjs` (every REST path this pack calls, as a named operation), `actions.mjs` (the runner's environment) with `hold.mjs` and the three env bags beside it, `sessions.mjs` (the routine fire that starts an agent), `git.mjs`, `processes.mjs`, `clock.mjs` |
| `src/signals/` | the collectors a precondition is handed, read through the ports and described in the contract's terms |
| `src/schedule/` | the tick: the repair phase that runs first, then which declared tasks have a window open and the items filed for them |
| `src/execute/` | the executor: claiming a ready item, running its code-work, handing it to an agent session |
| `src/session/` | what runs INSIDE a work-item session: converging the item, verifying its outcome, the exec record, dispatch resolution, and the automerge verdict as a command |
| `src/deliver/` | turning a run's output into a landed pull request or a regenerated file |
| `src/recover/` | repair: the queue's repair rules, workflow-failure escalation, the dead-run continuation |
| `src/adopt/` | what an adopting repo receives: the workflows converged from the stubs, the per-repo cron minute |
| `queue/` | `tasks/implement-request/`, the engine's own built-in task; the spec is `public/implement-request.md` |
| `stubs/` | the two workflow files an adopting repo receives |
| `public/` | **everything outside this pack may reference** — the vocabulary and grammar `src/` builds on, the import surface, and the documents a routine reads. See below |
| `tasks/` | this pack's own tasks: `usage-fold` (it folds this mechanism's run records and outcome labels), `tasks-usage-fold` (what the machinery itself cost - runs, billed minutes, API calls, outcomes, parks, latencies) and `verify-production` (coded production validations - URL probes judged as code-work) |
| `worldRules/` | the task-declaration checks |
| `workRules/` | the armed-auto-merge gate (`automerge-policy-scope`) |
| `declared-checks.json` | `tasks-pack-read-through-its-surface` — the guard over this pack's published surface, which runs wherever the pack is declared |
| `test/` | the unit suite, mirroring `src/`, and `test/sim/` — the simulator and its scenario suite, the mechanism's executable spec |
| `docs/PRINCIPLES.md` | the mechanism as claims, each citing the test that proves it |
| `src/deliver/deliver-pr.md` | the landing procedure every PR-delivering task's worker is pointed at, beside the lane it describes |

## `public/` — everything outside this pack may reference

One folder, one promise: **a name in `public/` does not move.** Everything a routine reads, another
pack imports or a member's own local pack names lives here, and nothing else of this pack is
addressable from outside. A member's `.github/workflows/` runs the entry points under `src/`
named by the two stubs, which are this pack's own files and not an outside caller.

Another pack's code may import `packs/claudinite-tasks/public/*` and nothing else of this pack;
the `pack-independence` barrier's allow list names that directory, and no other pack gains an
equivalent surface by existing. **A member's own `.claudinite/local/packs/**` reads it the same
way**, through its mount (`.claudinite/shared/packs/claudinite-tasks/public/*`): the nightly
converge replaces `.claudinite/shared/` and may never touch a member's own packs, so an import
aimed anywhere else is one this repository cannot repair when the layout behind it moves.

### Documents named from outside

| Path | What names it |
|---|---|
| `instructions.md` | a repo's work-item routine, as a stored prompt in its console settings |
| `implement-request.md` | the machine block of every issue adopted into the queue |

### Modules other packs import

Three of the five are the DEFINITION, and `src/` imports them from here: the vocabulary, the
grammar over it and the GitHub client import nothing of `src/`. The other two are the
machinery's own operations under a stable name.

| Module | What it publishes |
|---|---|
| `task-constants.mjs` | every value the queue writes and reads: the work item's labels, markers and body fields, the leases, the commit trailers, the declaration defaults, the pack's own parameters, the two workflow file names |
| `work-item-grammar.mjs` | the parse and serialize over that vocabulary — the title grammar that is an item's identity, the status and outcome decode over its labels (every legacy spelling included), the body fields, the machine block, the commit trailer |
| `github.mjs` | the GitHub client (`makeGh` and the run's call count), `dispatchWorkflow`, and the tracker issue a recurring task logs every run to |
| `delivery.mjs` | `deliverGenerated` — a regenerated file landed on a pull request that lands itself — and the landing lane's five names for a worker that lands its own pull request |
| `task-declaration.mjs` | the declaration's executable contract: the loader, its validation, the precondition evaluator the executor runs at pick, and the auto-merge policy engine |

A module publishes **named** exports rather than `export *`. A consumer needing something absent
asks for the named export to be added here, never a deeper import, which
`tasks-pack-read-through-its-surface` refuses. Who reads each name
is derived on demand: `node packs/claudinite-canon-curation/pack-surface.mjs packs/claudinite-tasks`
renders the surface and its consumers from the tree.

A pack whose **non-task** code reads any of the modules above declares `requires: ['claudinite-tasks']`. A
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
| `executor-workflow-secrets` | high | correctness | check: advisory |
| `tasks-pack-read-through-its-surface` | high | correctness | declared check: blocking |
| `repo-variables-through-the-bag` | high | correctness | declared check: blocking |
| `issue-label-outside-the-queue-vocabulary` | high | correctness | declared check: blocking |
| `queue-mark-named-literally` | high | correctness | declared check: blocking |

`tasks-pack-read-through-its-surface` is this pack's, not the canon's, because the consumers that
can get it wrong are members: it scans a repo's own `packs/` **and** its `.claudinite/local/packs/`,
the tree no converge may rewrite, so a deep import written there is caught in that repo's own run
rather than when it crashes.

`repo-variables-through-the-bag` — a module reads a repository variable over the REST variables
API, which the Actions `GITHUB_TOKEN` is refused on in every member (403, and no `permissions:` key
grants it), so the read never answers. Every repository variable already travels in the executor's
vars bag: a task's code-work finds it in `process.env`, engine code reads `varsBag(env)`.

The first two are relevance-first — inert until the repo carries a `tasks/<name>/task.json` of its own; the third is self-gating on the branch's own arming trailer.

- `task-declaration-shape` — a task declaration the scheduler reads is incomplete or illegal — no `trigger` saying who mints an occurrence, an unknown condition, an illegal value — so the task never fires or fires wrong.
- `task-code-work-env` — a task reads a `CLAUDINITE_*` variable code-work never sets, so a parameter (a scope filter, a dry-run switch) silently never arrives and the run goes green in its most dangerous mode.
- `executor-workflow-secrets` — the executor workflow does not pass a secret the tasks of this repo's packs declare, so the queue picks the item up and only the run finds out the secret is not there. The list is the tasks' alone; an invocation endpoint's `tokenSecret` is config, stamped by the converge and reported by the invocation call itself. Advisory because the remedy is a human-merged PR to `.github/workflows/`, the one fix a member's own machinery cannot make.
- `issue-label-outside-the-queue-vocabulary`: an `issue_write` call applies a label outside the `task:` namespace, which no scheduler run, executor or janitor reads: the issue is filed as if something would pick it up. `task:origin:ad-hoc` asks the queue for the work; no label at all is the ordinary issue.
- `queue-mark-named-literally`: a pack's prose tells a session to mark an issue for the queue, or to tag a backlog issue, without naming the label; naming `task:origin:ad-hoc` on the line satisfies it.
- `automerge-policy-scope` — a branch that stamped the `Claudinite-Automerge-Policy` trailer (its run intends to land its own PR) carries a diff its declared policy does not cover, which is exactly the unreviewed change the policy exists to stop.
