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

- **Release: Create Package** (`release.yml`) — runs on a version-bump merge to `main` (or
  dispatch, or a `workflow_call` from the daily auto-release); clean no-op when the version is
  already released; test gate = `npm run verify`; tags `vX.Y.Z` and attaches
  `crossword-chat.zip`.
- **Release: Publish to Chrome Web Store** (`publish-chrome-store.yml`) — manual dispatch
  (blank tag = latest release) or called by the daily auto-release; uploads via
  `chrome-webstore-upload-cli@3` with the four standard secrets `CHROME_EXTENSION_ID` /
  `CHROME_CLIENT_ID` / `CHROME_CLIENT_SECRET` / `CHROME_REFRESH_TOKEN` (tracked in issue #4;
  minting them is "Minting the API credentials" in the canon release guide), and refreshes the
  privacy page.
- **Release: Daily Auto-Release** (`daily-release.yml`) — daily at 03:00 UTC; ships only when
  the diff since the latest release tag touches `extension/`
  (`tools/filter-shipped-paths.mjs`), patch-bumping first.
- **Deploy privacy policy to GitHub Pages** (`deploy-privacy-page.yml`) — publishes
  [`store_artifacts/PRIVACY.md`](store_artifacts/PRIVACY.md) at
  `https://missingbulb.github.io/CrosswordChat/privacy/` (standalone dispatch, and on every
  store publish).
- **Report workflow failure** (`report-failure.yml`) — the reusable reporter all of the above
  escalate to (standing `workflow-failure` tracking issues).

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
