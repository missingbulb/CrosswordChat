# Tasks usage fold — what the machinery itself cost

**This task runs no agent.** It is `agent_model: none` with `code_work: node worker.mjs`, so the whole pass is the deterministic [`worker.mjs`](worker.mjs) the executor runs as code-work, which calls the counting and folding core beside it ([`fold-tasks-usage.mjs`](fold-tasks-usage.mjs)). This file is the human-facing record of what that worker does.

## Two files, and why this is not the other one

[`usage-fold`](../usage-fold/README.md) folds what this repo's **sessions** did — skill loads, tokens, check findings, what landed in git. This one folds what the **machinery** did: how often the scheduler and the executor ran, what those runs were billed, what they spent in API calls and wall time, and what each occurrence of each task came to.

The split is by **source**, not by subject. The session fold's numbers come out of capture files it re-reads for free off a local branch; every source behind this one is a rate-limited REST listing read past a watermark. Keeping them in one file would mean one source's outage degrading the other's rows, one cadence serving two very different read costs, and a single watermark standing for two clocks.

What they share is their discipline, deliberately — the same three tiers, the same per-source fail-soft, the same rule that **an absent source leaves no key, never a zero** — and the readers, where one already reads the source: this fold's run listings are [`packs/claudinite-tasks/tasks/usage-fold/read-runs.mjs`](../usage-fold/read-runs.mjs)'s, and its task-and-park decoding is [`packs/claudinite-tasks/tasks/usage-fold/read-queue.mjs`](../usage-fold/read-queue.mjs)'s.

## What the file carries

`.claudinite/usage/task-runs-and-costs.json`, per hour, per day and per week:

- **Per workflow** (`scheduler`, `executor`) — `runs`, `jobs`, `minutesBilled`, and `spend`. Actions bills per **job**, not per run, so a run's minutes are the sum over its jobs of each job's wall time rounded up to a whole minute, and the two counts are kept apart. `spend` exists only where this pack's config carries `actionsMinuteRate`: unset leaves **no key at all**, because a public repo bills nothing and a private one bills something, and a zero would be a claim nobody made. The rate every figure was priced at is written into the file beside them, so a rate changed later cannot silently re-price rows frozen under the old one.
- **Per run** — `apiCalls` and the wall milliseconds of each phase (`list`, `ask`, `drain` for a tick; `pick`, `claim`, `code-work`, `hand-off`, `converge` for an executor run), from the `claudinite-run-cost` record every run prints. The format is [`packs/claudinite-tasks/src/items/run-record.mjs`](../../src/items/run-record.mjs)'s, beside the two execution records; the API calls are counted at the GitHub port itself, which is the only place every call passes through.
- **Per task** — what its occurrences came to (`done`, `delivered`, `obsolete`, `none`), the parks they collected by kind, and four **latency samples** off each closed item's own label events: tick→item, item→pick, pick→hand-off, hand-off→converge. Samples, never quantiles: a week's p50 is not derivable from its days', so the file carries what a reader needs to take the quantile over whatever window it is drawing. A slot whose far end never happened — an agentless item has no hand-off — is absent, which is not a latency of zero.

## Where a run's cost record is read from

A **scheduler tick owns no work item**, so the record it printed exists nowhere but its job log, and the fold reads it there. That read is what the cadence buys: the scheduler fires twice a day, at most two of its runs have their log read per fold, and at most two jobs are opened per run — so the log reads are bounded at four whatever else happened.

An **executor run has items**, so it writes its record where the record survives Actions retention: onto every item it settles, in the same fenced block as the execution record. One run therefore leaves several snapshots of one record, each a reading of counters that only ever grow, and the fold keys them by run id and keeps the **largest** — the run's total as of its last item. Under-counting is one-directional by construction, as every other floor in these two files is.

## The API budget

Stated here because it is the reason the reads are shaped as they are. Per fold:

- two run listings, flat, however many runs are in the window;
- one jobs listing per run this fold has not seen;
- at most four job-log reads;
- one issues listing page, plus one **timeline** read per item closing for the first time — one read, not two, because the timeline carries the labelings, the comments and the close together, which is exactly the three things this fold wants off an item.

On this repo's own cadence — two ticks a day and the executor runs a quiet queue dispatches — the run half of that is under ten calls a day, and the task's test asserts it by counting the fetches a representative day makes. `MAX_RUN_READS` is the runaway guard rather than the budget: a day that somehow produced hundreds of runs stops at the cap, leaves the watermark at the last run measured, and says so.

## Every tier is appended once

This is the one place the discipline differs from the session fold's, and it is worth stating plainly: that file recomputes its day rows from capture files, so a counting fix heals its whole visible window. **Nothing here is recomputed.** Every source is a watermarked listing, a run or an item is folded on the one pass that first sees it, and a counting bug fixed later applies from the fix forward.

Appending is safe because each fact is settled once seen — a completed run's start and conclusion do not move, a closed item's outcome label is written at convergence and is never moved — and both watermarks are monotone over those facts, which is the whole exactly-once mechanism. No ingest ledger.

Two maps do not reach the week tier on the same terms as the rest. A week's keys are frozen forever, so `runCosts` — keyed by run id, unique per occurrence — is dropped there and its numbers survive as the week's own scalars; per-run detail answers "what did this tick cost", which nobody asks of a week last February. `latency` is kept, unique keys and all, because the samples *are* the week-level answer.

## When it runs

Daily, and only when the machinery has moved: [`preconditions.mjs`](preconditions.mjs)'s `runs-since-fold` holds while the file's own `runsFoldedThrough` still stands before the scheduler's most recent anchor. That is the mark's own movement rather than standing state — it goes false the moment a fold catches up and true again at the next tick — and it costs no API call, which matters on a term asked at every tick.

## The file is GENERATED

Machine-written and never hand-edited. It lives under `.claudinite/local/` because that is the repo-owned area the vendoring refresh never touches, and `merge=ours` reaches it through the mount's own `.gitattributes`, whose `*GENERATED*` pattern the engine converges — so this file needed no attributes line of its own.
