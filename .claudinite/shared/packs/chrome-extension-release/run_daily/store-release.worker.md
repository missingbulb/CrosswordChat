# chrome-store-release worker

`smarts: none` — no agent. The orchestrator runs this as a direct action for the version in
`targets.unreleasedVersion` (the manifest is ahead of the latest published release, `targets.lastReleased`).

**Stage 1 (conservative, publishing stays gated):** ensure a release-readiness tracking issue exists
in the repo — idempotent, found by title `Chrome Web Store release ready: v<unreleasedVersion>` — so
an unreleased bump surfaces without anything auto-publishing. Skip if one already exists (open or
closed for this version).

The actual store submission is a **`workflow_dispatch`-only** Action (the pack's `Release to Chrome
Store` workflow — see [RELEASE.md](../RELEASE.md)); it is **never scheduled** (the fleet routine is
the only schedule — see the scheduling contract). Wiring the worker to trigger-and-await that Action
(and report at completion, not at the trigger) is the follow-up once the readiness signal is trusted.
