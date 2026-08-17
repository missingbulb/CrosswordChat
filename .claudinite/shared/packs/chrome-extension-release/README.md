# chrome-extension-release pack

The release & Chrome-Web-Store publication standard for our extensions — the reusable workflows' contract, the setup steps, the manual store actions (`RELEASE.md`), the **vendored release set** (`stubs/workflows/` + `stubs/actions/`, materialized into each consumer's own `.github/`), and the conformance checks. **Opt-in**: a project declares it in `.claudinite-checks.json` when it's ready to ship (a `manifest.json` alone does not pull it in). Declaring it is the cue to vendor the release machinery — the migration apply pass materializes the set (the `chrome-release-vendoring` migration), the pack's checks keep it in shape, and setup opens the one-time first-publication issue. GitHub only resolves a reusable workflow / composite action from a repo's own `.github/`, so the pack holds the templates and each consumer hosts a managed copy — no cross-repo `@main` dependency.

Fingerprint: a repo already carrying the standard's `Release to Chrome Store` orchestrator (a workflow with that name — or a legacy pre-rename name like `Release` — that wires the create-package reusable, whether via the vendored local `./.github/workflows/chrome-extension-create-package.yml` or the pre-vendoring canon call `@main`). `--init` uses it to seed the pack into a fresh declaration (including a repo that shipped release before this pack existed); the marker only *suspects* the pack, so it never forces or forbids the declaration afterward.

## Checks

The release set's conformance rules. Every one of them is about a release that would otherwise fail — or publish the wrong thing — only once it reached the store.

| Check | Severity | Reason | Enforcement |
|---|---|---|---|
| `cer/release-workflows` | high | correctness | check: blocking |
| `cer/template-tokens` | high | correctness | check: blocking |
| `cer/release-config` | high | correctness | check: blocking |
| `cer/version-sync` | high | correctness | check: blocking |
| `cer/release-layout` | medium | correctness | check: blocking |
| `cer/readme-sections` | low | complexity | check: blocking |
| `cer/privacy-permission-alignment` | critical | legal | check: blocking |
| `cer/permission-added-store-issue` | high | legal | check: advisory |
