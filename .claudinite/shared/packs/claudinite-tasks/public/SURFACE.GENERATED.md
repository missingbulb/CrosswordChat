# `packs/claudinite-tasks/public/` — the published surface

GENERATED — do not hand-edit. Rendered from the tracked tree by the canon's
`packs/claudinite-canon-curation/test/pack-surface.test.mjs`; regenerate by running that
test in a canon checkout.

What this folder publishes, and who outside the pack reads it. **Read for surface
GROWTH**: a name appearing here that nothing outside the pack takes is surface the pack
is promising to keep without being asked to, and a row whose consumers are only tests is
a contract the canon holds with itself.

Counts are per module. *Published* is what the file exports; *taken* is how many distinct
names anything outside the pack actually imports — a workflow that runs a module with
`node` reads the file and takes no name, so an entry-point module reads `—`. A path named
only in a comment or a remedy's prose is a **mention**, counted apart: it depends on
nothing and breaks nothing when the surface moves.

| Module | Published | Taken | Published, taken by nobody | Who reads it |
|---|---|---|---|---|
| `anchors.mjs` | 12 | 11 | `ACCEPTED_FREQUENCIES` | pack: claudinite-dashboard |
| `converge-workflows.mjs` | 9 named + `export *` from `../src/adopt/converge-workflows.mjs` | — | `EXECUTOR_WORKFLOW`, `SCHEDULER_WORKFLOW`, `convergeExecutorWorkflow`, `convergeSchedulerWorkflow`, `convergeWorkflows`, `declaredSecrets`, `runConvergeWorkflows`, `secretNames`, `stubsDir` | **nobody** |
| `create-work-item.mjs` | 5 | — | `FORCED_CONTEXT`, `createWorkItem`, `parseArgs`, `runCreateWorkItem`, `wakeItem` | **nobody** |
| `delivery.mjs` | 10 | 10 | — | pack: claudinite-canon-curation, claudinite-lifecycle, cloudflare-site, github-pages |
| `dormancy.mjs` | 3 | 1 | `TASKS_PACK_ID`, `dormancyErrors` | pack: claudinite-dashboard, claudinite-fleet-sheepdog; pack (test): claudinite-fleet-sheepdog |
| `drain-dispatch.mjs` | 2 | — | `dispatchDrain`, `runDrainDispatch` | workflow: .github; canon: vendoring |
| `executor-continuation.mjs` | 5 | — | `CHAIN_FAILURE_TITLE`, `MAX_DEPTH`, `continueOrEscalate`, `nextDepth`, `runExecutorContinuation` | workflow: .github; canon: vendoring |
| `executor.mjs` | 9 | — | `claimComment`, `claimWinner`, `conflictsWithEarlierClaim`, `evaluatePrecondition`, `noGoPlan`, `pickOrder`, `rollBody`, `runExecutor`, `runExecutorJob` | workflow: .github; canon: vendoring; canon (test): engine-tests; 5 prose mentions |
| `github.mjs` | 9 | 9 | — | pack: basics, claudinite-dashboard, claudinite-growth, github-pages; pack (test): claudinite-dashboard |
| `merge-policy.mjs` | 5 | 4 | `diffEntries` | pack: claudinite-canon-curation; pack (test): claudinite-canon-curation, claudinite-growth, claudinite-lifecycle |
| `preconditions.mjs` | 6 | 2 | `MAX_CONTEXT_ITEMS`, `TASK_TERMS_FILE`, `evaluatePreconditions`, `preconditionSignals` | pack (test): chrome-extension, claudinite-canon-curation, claudinite-growth, claudinite-lifecycle |
| `pull-requests.mjs` | 2 | 1 | `hoursBetween` | pack: claudinite-dashboard |
| `scheduler-run.mjs` | 11 named + `export *` from `../src/schedule/run.mjs` | — | `EXECUTING_LEASH_MS`, `FORCED_WAKE_CONTEXT`, `blockersToResolve`, `listMarkedIssues`, `listWorkItems`, `parseWorkItemTitle`, `pickableCount`, `planSchedulerRun`, `planWake`, `runSchedulerRun`, `withOwnWrites` | workflow: .github; pack (test): .claudinite, chrome-extension, claudinite-lifecycle, git-github; canon: vendoring; 3 prose mentions |
| `signals.mjs` | 1 named + `export *` from `../src/signals/index.mjs` | 1 | — | pack (test): chrome-extension |
| `substantive-commit.mjs` | 2 | 1 | `HOUSEKEEPING` | pack: claudinite-dashboard |
| `task-contract.mjs` | 7 | 6 | `validateTaskDeclaration` | pack: claudinite-canon-curation; pack (test): basics, chrome-extension, claudinite-canon-curation, claudinite-dashboard, claudinite-fleet-sheepdog, claudinite-growth, claudinite-lifecycle, product-wiki |
| `task-declaration.mjs` | 2 | 2 | — | pack: claudinite-dashboard |
| `task-discovery.mjs` | 2 | — | `findTaskDeclaration`, `loadTaskDeclaration` | **nobody** |
| `tick.mjs` | 0 | — | — | **nobody** |
| `usage-format.mjs` | 1 named + `export *` from `../src/items/usage-format.mjs` | — | `USAGE_PATH` | **nobody** |
| `verification.mjs` | 3 | 3 | — | pack (test): basics |
| `wake.mjs` | 1 | 1 | — | pack (test): claudinite-fleet-sheepdog |
| `work-items.mjs` | 57 | 55 | `ASKED_FOR_ORIGINS`, `isDispatchTitle` | pack: claudinite-dashboard, claudinite-fleet-sheepdog, claudinite-lifecycle; pack (test): basics, claudinite-dashboard |
| `workflow-failure.mjs` | 7 | — | `FAILURE_LABELS`, `SCHEDULER_FAILURE_TITLE`, `WORKFLOW_FAILURE`, `findOpenFailureIssue`, `reportWorkflowFailure`, `runUrl`, `runWorkflowFailureReport` | workflow: .github; canon: vendoring |

## Documents

| Document | Who reads it |
|---|---|
| `implement-request.md` | **nobody** |
| `instructions.md` | pack: claudinite-lifecycle; canon: bootstrap.md; canon (test): vendoring |

## Wildcards — surface not pinned

4 modules re-export with `export *`, so what they publish is whatever the
target exports at the time — an internal rename widens or narrows the promise with no
edit here and no diff in this report's name counts.

- `converge-workflows.mjs` → `../src/adopt/converge-workflows.mjs`
- `scheduler-run.mjs` → `../src/schedule/run.mjs`
- `signals.mjs` → `../src/signals/index.mjs`
- `usage-format.mjs` → `../src/items/usage-format.mjs`
