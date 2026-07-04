# CrosswordChat — Versioning, CI, Releases, Store Deployment

## Version

- **Source of truth:** `extension/manifest.json` → `version` (currently **0.9.0**).
- `package.json` / `package-lock.json` mirror it; CI fails if they drift (Test workflow).
- Bump with `node tools/bump-version.mjs patch|minor|major|x.y.z` — updates all three files
  and prints the new version. The Release workflow does this for you.

## The four workflows

| Workflow | File | Trigger | What it does |
|---|---|---|---|
| **Test** | `.github/workflows/test.yml` | every push; PRs to `main` | `npm run verify` (118 tests + requirements-coverage trace), version-consistency check, build compiles |
| **Pack extension** | `.github/workflows/build.yml` | push to `main`; manual | Builds `dist/`, zips it (manifest at zip root — store-uploadable), uploads as a 30-day workflow artifact |
| **Release** | `.github/workflows/release.yml` | manual (choose patch/minor/major or an explicit version) | Verify → bump → build → commit `Release vX.Y.Z` → tag `vX.Y.Z` → GitHub Release with the zip attached |
| **Deploy to Chrome Web Store** | `.github/workflows/deploy-chrome-store.yml` | automatically on a published Release; or manual (with a draft-only option) | Rebuilds from the tag, uploads to the store via the official API (plain `curl`, no third-party action touches credentials), optionally submits for review |

Normal release path: **Actions → Release → Run workflow** (pick the bump) — everything else
cascades, ending with a store submission.

## Chrome Web Store deployment — one-time setup

The deploy workflow needs four repository secrets
(**Settings → Secrets and variables → Actions → New repository secret**).
Tracked in the issue *“Configure Chrome Web Store deployment secrets.”*

| Secret | What it is |
|---|---|
| `CHROME_EXTENSION_ID` | The 32-letter item ID from the developer dashboard (exists after the first manual upload) |
| `CHROME_CLIENT_ID` | OAuth 2.0 client ID from your Google Cloud project |
| `CHROME_CLIENT_SECRET` | Its client secret |
| `CHROME_REFRESH_TOKEN` | Long-lived refresh token minted for that client with the `chromewebstore` scope |

### Steps

1. **Create the store listing manually (once).** The API can update an existing item but the
   listing itself — description, screenshots, privacy disclosures, the one-time $5 developer
   fee — must be created in the [developer dashboard](https://chrome.google.com/webstore/devconsole).
   Upload any zip from the *Pack extension* workflow (or `npm run build` + zip `dist/`).
   Copy the item ID → `CHROME_EXTENSION_ID`.
2. **Create API credentials.** Follow Google's guide,
   [Using the Chrome Web Store Publish API](https://developer.chrome.com/docs/webstore/using-api):
   create/pick a Google Cloud project → enable **Chrome Web Store API** → configure the OAuth
   consent screen → create an **OAuth client ID** (Desktop app) → `CHROME_CLIENT_ID` / `CHROME_CLIENT_SECRET`.
3. **Mint the refresh token.** Easiest: `npx chrome-webstore-upload-keys` (walks the OAuth flow
   and prints the refresh token); or the manual flow in the guide above. → `CHROME_REFRESH_TOKEN`.
   Use the same Google account that owns the store listing.
4. **Dry-run.** Actions → *Deploy to Chrome Web Store* → Run workflow with **publish = false**:
   uploads a draft without submitting. Check the dashboard shows the new version, then re-run
   with publish on (or just cut a Release).

### Store facts worth knowing

- Every upload must carry a **strictly greater version** than the last one on the dashboard —
  the Release workflow guarantees this.
- Publishing enters Google's review queue (hours to days); the workflow reports
  `ITEM_PENDING_REVIEW` as success.
- The refresh token is tied to the OAuth consent screen configuration; if the consent screen is
  left in *Testing* mode, Google expires refresh tokens after 7 days — set it to *In production*
  (the app is only used by you; no verification needed for the `chromewebstore` scope).
