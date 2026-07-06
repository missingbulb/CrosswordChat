# Releasing / publishing to the Chrome Web Store

This repo follows the shared Chrome-extension release standard — the canon guide
(`.claudinite/technologies/chrome-extension-release.md`, "the canon release guide" below) owns
the cross-repo contract, the canonical workflow files, and the manual store procedures; this
file holds this repo's concrete names, paths, and listing facts.

## The package

`npm run build` bundles the extension with esbuild into `dist/` and zips it into
**`dist/crossword-chat.zip`** (manifest at the zip root; see `tools/build.mjs`). The zip name is
stable (never version-stamped), so the newest build is always at
`https://github.com/missingbulb/CrosswordChat/releases/latest/download/crossword-chat.zip`.

## Versioning

The version users see is `extension/manifest.json`'s `version`; `package.json` /
`package-lock.json` mirror it (the Test workflow fails CI on drift). Minor/major bumps are
deliberate, by a human — "bump version" runs `node tools/bump-version.mjs minor|major|x.y.z` on
a branch and lands on `main` via a normal PR (default: next minor); merging the bump cuts the
release. Patch bumps are made automatically by the daily auto-release
(`node tools/bump-version.mjs patch`). The Create-Package workflow never changes the version.

## The workflows (the standard set)

Four thin stubs in `.github/workflows/` call the standard's reusable workflows in the Claudinite
canon — the set's shape, triggers, and behavior (including failure reporting to standing
`workflow-failure` tracking issues) are the canon release guide's "Workflows" section; don't
restate them here. Only this repo's values, passed as the stubs' `with:` inputs, live here:

- Zip: `dist/crossword-chat.zip` (see [The package](#the-package)); manifest
  `extension/manifest.json`.
- Test gate: `npm run verify`.
- Daily bump/filter commands (dependency-free): `node tools/bump-version.mjs patch` /
  `node tools/filter-shipped-paths.mjs` (shipped = what feeds the bundled zip, everything under
  `extension/`).
- Privacy page: [`store_artifacts/PRIVACY.md`](store_artifacts/PRIVACY.md) at
  `https://missingbulb.github.io/CrosswordChat/privacy/`.
- The four store secrets are the standard names (tracked in issue #4) — minting them is
  "Minting the API credentials" in the canon release guide.

(The former Pack/rolling-`latest` flow is gone: with releases cut on every bump-merge and the
daily auto-release, `releases/latest/download/` is the permanent newest-build URL. The old
`latest` prerelease and tag can be deleted from the GitHub UI.)

## First publish to the Chrome Web Store

The dashboard walkthrough is the standard procedure — "First publication" in the canon release
guide. This repo's values are pre-written in
[`store_artifacts/STORE-LISTING.md`](store_artifacts/STORE-LISTING.md) (listing copy,
permission justifications, data-usage answers, reviewer notes, and the graphic-asset file map —
regenerate assets with `node tools/make-store-assets.mjs`); the privacy policy URL is
`https://missingbulb.github.io/CrosswordChat/privacy/` (deploy it once via the privacy
workflow's dispatch before submitting). After the first upload, copy the item ID into the
`CHROME_EXTENSION_ID` secret (issue #4).
