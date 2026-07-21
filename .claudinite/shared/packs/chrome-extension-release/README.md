# chrome-extension-release pack

The release & Chrome-Web-Store publication standard for our extensions — the reusable workflows' contract, the setup steps, the manual store actions (`RELEASE.md`), the **vendored release set** (`stubs/workflows/` + `stubs/actions/`, materialized into each consumer's own `.github/`), and the conformance checks. **Opt-in**: a project declares it in `.claudinite-checks.json` when it's ready to ship (a `manifest.json` alone does not pull it in). Declaring it is the cue to vendor the release machinery — the migration apply pass materializes the set (the `chrome-release-vendoring` migration), the checks below keep it in shape, and setup opens the one-time first-publication issue. GitHub only resolves a reusable workflow / composite action from a repo's own `.github/`, so the pack holds the templates and each consumer hosts a managed copy — no cross-repo `@main` dependency.

Fingerprint: a repo already carrying the standard's `Release to Chrome Store` orchestrator (a workflow with that name — or a legacy pre-rename name like `Release` — that wires the create-package reusable, whether via the vendored local `./.github/workflows/chrome-extension-create-package.yml` or the pre-vendoring canon call `@main`). `--init` uses it to seed the pack into a fresh declaration (including a repo that shipped release before this pack existed); the marker only *suspects* the pack, so it never forces or forbids the declaration afterward.

## Checks

| Check | Enforces (≤5 words) | Severity |
|---|---|---|
| `cer/release-workflows` | vendored set present: orchestrator name/schedule + local reusables + actions | blocking |
| `cer/template-tokens` | no unreplaced `__TOKEN__` survives | blocking |
| `cer/release-config` | `.github/release.config` present with all 5 required keys, no unknowns | blocking |
| `cer/version-sync` | manifest and package.json versions agree | blocking |
| `cer/release-layout` | privacy policy source present | blocking |
| `cer/privacy-permission-alignment` | every permission disclosed in PRIVACY.md (test the world) | blocking |
| `cer/permission-added-store-issue` | added permission → open store-dashboard issue (test the work) | advisory |
| `cer/readme-sections` | README has Install + Releasing | blocking |

`RELEASE.md` is the full contract (setup and the manual store steps); it is read on demand, not loaded every session. Most of its invariants are enforced by the checks above.
