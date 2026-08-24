# Version history

Records for `packs/claudinite-tasks/pack.mjs`'s `version` field, one row per bump.

| Version | Date | What changed |
|---|---|---|
| 60824.3 | 2026-08-24 | The executor workflow names its secrets again, stamped by the converge at the `# claudinite:secrets` marker: `toJSON(secrets)` is the shape GitHub's malicious-workflow detection flags, and a flagged workflow parks every run behind a human approval (#1336, reversing #1301). |
| 60824.2 | 2026-08-24 | Scheduling wiring is the pack's own `converge-workflows.mjs`, scaffolded at adoption; a migration record declares the pack into every member that runs scheduled work (#1317). |
| 60824.1 | 2026-08-24 | The pack's first version: the task execution and scheduling surface moves out of `engine/scheduler/` into `packs/claudinite-tasks/`, with `task-janitor`, `usage-fold` and the two task-declaration checks relocating in beside it (#1317). |
