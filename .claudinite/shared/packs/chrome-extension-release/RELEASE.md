# Chrome extension — release & Chrome Web Store publication standard

Every Chrome-extension repo of ours ships the **same** release pipeline: same workflows, same
Chrome Web Store API usage, same secrets, same versioning and artifact rules, same README install
sections. This doc is that contract, the setup steps for a new extension repo, and the manual
Chrome Web Store actions the automation can't do. The workflow **logic** is authored once, in this
pack's [`stubs/`](stubs/) — the [orchestrator](stubs/workflows/chrome-extension-release.yml), the
four `workflow_call`-only **reusable workflows**, and the
[report-failure](stubs/actions/report-failure/action.yml),
[read-release-config](stubs/actions/read-release-config/action.yml) and
[bump-extension-patch](stubs/actions/bump-extension-patch/action.yml) composite actions — and
**vendored into each extension repo's own `.github/`**, where the whole pipeline runs with no
cross-repo dependency. GitHub only resolves a reusable workflow or composite action from a repo's
own `.github/`, so "the logic lives in the pack" means the pack holds the templates and each repo
hosts a *managed* copy: the pack keeps every copy in sync — baselining re-materializes on drift via
the `chrome-release-vendoring` migration — so a repo **hosts** the pipeline without **owning** it.
Treat the vendored `.github/workflows/` + `.github/actions/` set as generated: edit the pack, not
the copy. A repo adds only its **required** `.github/release.config` (five explicit keys, **no
defaults**). A merged canon change reaches every extension repo through the nightly baselining, not
a live `@main` reference. Everything a repo used to carry as workflow values — the version files, the
zip location, the test gate, the shipping set, and the previously per-repo `bump`/`filter` scripts
— is either pack logic (the bump/filter, and `npm run build`) or an explicit `release.config` key,
so no repo ships a bump or filter script any more. Reference implementation:
`missingbulb/GoogleCalendarEventCreator`; also adopted by `TLDR` and `CrosswordChat`.

Naming in the flat `.github/workflows/` namespace: Chrome-specific logic carries the
`chrome-extension-` prefix (future publish standards — other stores — will live beside it);
genuinely platform-agnostic pieces (`deploy-privacy-page.yml`, the `report-failure` action) keep
general names so other standards reuse them as-is. When in doubt, prefix.

## The contract

**Versioning**

- The extension manifest's `version` (`X.Y.Z`) is the single source of truth. The extension's
  `package.json` `version` must equal it, enforced by a CI-run guard (a unit test or an inline
  workflow check — the repo picks the mechanism, the invariant is fixed).
- Minor/major bumps are deliberate and human: **"bump version"** = edit the manifest and
  `package.json` (plus any repo version-sync constant) together on a branch — default the next
  **minor** — and land on `main` via a normal PR. Merging the bump *is* cutting the release.
- Patch bumps belong to the daily auto-release. No workflow other than the daily bump ever
  changes the version; "Release: Create Package" never does.

**Artifact**

- `npm run build` produces the zip at the **forced-uniform** standard location
  `dist/<kebab-cased repo name>.zip` (e.g. `dist/google-calendar-event-creator.zip`, `dist/tldr.zip`,
  `dist/crossword-chat.zip`) — the place/name is derived, not a config choice; a repo's build must
  write there. Stable, never version-stamped, so
  `https://github.com/<owner>/<repo>/releases/latest/download/<zip>` is a permanent
  newest-build URL. `manifest.json` sits at the zip's top level.
- The zip's contents come from a single shipping-set source of truth in `dev/build/release/`,
  drift-guarded by a test — nothing dev/test-only ships, and a renamed runtime file fails the
  build rather than silently dropping out of the package.
- A release is GitHub Release **`vX.Y.Z`**, tagged at the released commit, with auto-generated notes
  and **two** assets built from the one tested tree, differing only in the injected `API_BASE_URL`:
  the headline **`<zip>`** (the permanent `…/releases/latest/download/<zip>` URL) is built with
  `API_BASE_URL` **cleared**, so it keeps the committed **dev** default — the downloadable build is
  dev, never prod; **`<zip>-prod.zip`** carries the injected prod `API_BASE_URL` and is the store's
  source of truth (the publish job downloads it). So **only the store submission is prod-pointed**;
  the signing key + client id are injected into both. (A repo with no `API_BASE_URL` — no backend —
  produces two byte-identical zips; the split is a no-op there.)

**Workflow** — **one** orchestrator per repo, [`chrome-extension-release.yml`](stubs/workflows/chrome-extension-release.yml), named exactly
`Release to Chrome Store`. It owns only the triggers; its three `if:`-guarded jobs each call a **local**
reusable workflow (`./.github/workflows/…`, all vendored alongside it). The failure reporter keys
tracking issues on the **per-operation** names baked into the reusable workflows (`Release: Create
Package`, `Release: Publish to Chrome Web Store`, `Release: Daily Auto-Release`) — not on the
orchestrator's `name:` — so collapsing to one entry point loses no per-operation triage:

| job (trigger) | reusable workflow it calls — what it does |
|---|---|
| `create-package` (push to `main`; dispatch `mode: package`) | `chrome-extension-create-package.yml` — version guard (a clean no-op unless the manifest version was bumped, so ordinary pushes don't cut a release) → full test gate → build the dev headline `<zip>` + the prod `<zip>-prod.zip` → GitHub Release |
| `publish` (dispatch `mode: publish` — the default — with `tag`, `auto_publish`) | `chrome-extension-publish-store.yml` — download the prod `<zip>-prod.zip` (falls back to `<zip>` for pre-split releases) → upload via the store API (publish to users unless `auto_publish: false` → dashboard draft) → refresh the `/privacy/` page (via the `deploy-privacy-page.yml` reusable) |
| `daily` (schedule `30 0 * * *`; dispatch `mode: daily`) | `chrome-extension-daily-release.yml` — shipped-file diff vs the latest release tag → patch bump pushed to `main` → calls the two reusable workflows above |

The `create-package` job triggers on **every** push to `main` (no per-repo manifest path in the
trigger) and relies on the version guard to no-op unless a bump landed. The privacy page has **no
job of its own** and no dedicated option: it redeploys as part of **every** publish, from the same
`PRIVACY.md` the listing points at. The publish workflow runs that deploy leg even when the store
upload fails (so the `/privacy/` URL goes live before the first publication too — see below). The
platform-agnostic `deploy-privacy-page.yml` reusable workflow is vendored alongside the others and
called by the publish reusable — a repo never dispatches it directly.

- Repo-specific values do **not** travel as `with:` inputs — the reusable workflows read them from
  the repo itself via the `read-release-config` action, so the orchestrator is copy-verbatim. They live in a
  **required, fully explicit** `.github/release.config` (dotenv) — **five keys, no defaults**, because
  a default that "happens to match" a repo's layout silently ships the wrong thing when the layout or
  the default later changes:
  `manifest_path`, `package_json_path`, `setup_command` (`""` = no install, stated),
  `test_command`, `ship_paths`. Two things are **not** keys because they are **forced-uniform
  structure**, not a per-repo choice: the **build** is always `npm run build`, and the **zip** lives
  at `dist/<kebab repo name>.zip` (both `zip_path` and the asset name are derived).
  `cer/release-config` fails the review on a missing file, a missing required key, or an unknown
  (typo'd) key.
- The one value that stays in the **orchestrator** (not the config file) is `build_env` — KEY=VALUE lines a
  repo whose build bakes in release config passes on the `create-package` and `daily` jobs, because
  it must reference `${{ vars.* }}` statically. Every listed key must be non-empty or the run fails,
  so a repo can't ship a placeholder-configured zip. These are the genuine per-**environment**
  values that must not be committed; they live in repository **variables** (Settings → Secrets and
  variables → Actions → Variables). Store secrets travel via `secrets: inherit`.
- Every unattended workflow (all of the above; not PR CI) reports failures through the
  `report-failure` composite action baked into the reusable workflows — a red run must reach a
  human, never sit unseen in the Actions list. Each failure opens a **fresh** `workflow-failure`
  issue, and any earlier open failure issues for the **same** workflow are closed as duplicates of
  it, so the newest failure is always the single open bug to triage. Repos no longer carry a
  `report-failure.yml`; a repo's own non-standard unattended workflows use the vendored action
  directly (`uses: ./.github/actions/report-failure`).
- Daily auto-release semantics: the baseline is the **latest release tag**, not a 24-hour window
  (self-healing after a failed day); "deployable" = a change under one of the repo's explicit
  `ship_paths` roots; the patch bump is pushed straight to `main` (`[skip ci]`)
  because the store rejects a version that isn't strictly higher; release + publish are invoked via
  `workflow_call` because a `GITHUB_TOKEN` push triggers no workflows. Days with no shipped-file
  change are a clean no-op.
- The patch bump and the shipped-file filter are **pack logic**, not per-repo scripts: the bump is
  the `bump-extension-patch` composite action (token-replaces the version in `manifest_path` +
  `package_json_path`), and the filter is a `ship_paths` prefix match in the daily workflow. Both,
  and the `read-release-config` action, are dependency-free and run on a bare runner (no `npm ci`).
  A repo whose shipping set is a curated subset (not a whole directory) lists it in `ship_paths` and
  keeps its build's own ship-set test honest against that list.
- Until the four store secrets exist, the publish leg fails **loudly** (a fail-early step lists
  the missing names, and the tracking issue nags) — that is the designed state for a repo that
  hasn't finished its first manual publication; releases and zips still work.

**Chrome Web Store API** — uploads go through `chrome-webstore-upload-cli@3`
(`npx --yes chrome-webstore-upload-cli@3 upload --source dist/<zip> [--auto-publish]`), which
reads env `EXTENSION_ID` / `CLIENT_ID` / `CLIENT_SECRET` / `REFRESH_TOKEN` — set from the four
repository **secrets**, same names in every repo:
`CHROME_EXTENSION_ID`, `CHROME_CLIENT_ID`, `CHROME_CLIENT_SECRET`, `CHROME_REFRESH_TOKEN`.

**Privacy page** — the policy source is `dev/build/release/store_artifacts/PRIVACY.md`; a Jekyll
`permalink: /privacy/` pins the public URL `https://<owner>.github.io/<repo>/privacy/`
independent of the file's location. The store listing's Privacy-tab URL points **there**, never
at a `blob/main` link. The page redeploys on every store publish — the publish workflow's
privacy-deploy leg runs regardless of whether the upload leg succeeds, so it also brings the URL up
for the very first publication.
One-time: repo Settings → Pages → Source = "GitHub Actions".

**Store listing & permission justifications live in the dashboard, not the repo** — the listing
copy (name, summary, detailed description, category), the graphic-asset choices, and the
Privacy-practices answers (single-purpose statement, a justification for **every** permission the
manifest requests — `permissions`, `host_permissions`, and `optional_*` alike — the remote-code
answer, data-usage declarations, reviewer notes) are all Chrome Web Store dashboard state. We keep
**no** repo copy of them: a mirror only drifts from the dashboard it duplicates. They are authored
once, at the first publication (tracked by a one-time issue — see setup below), and edited in the
dashboard thereafter. What the repo *does* hold and enforce is the privacy policy and its
agreement with the manifest:

- `dev/build/release/store_artifacts/PRIVACY.md` is the privacy policy, deployed verbatim as the
  public `/privacy/` page the listing points at.
- `cer/privacy-permission-alignment` (test the world) blocks whenever a permission the manifest
  requests isn't disclosed in `PRIVACY.md` — the one alignment that must hold at all times.
- `cer/permission-added-store-issue` (test the work) fires when a change *adds* a permission,
  prompting the one step that can't be automated: open a tracking issue to add that permission's
  justification on the dashboard's Privacy-practices tab before the next publish.

**Store assets & icons** — required inventory: a 128 px store icon; the manifest icons the
extension ships (16/32/48/128), living inside the extension source where the manifest points;
at least one 1280×800 (or 640×400) screenshot; optionally 440×280 small and 1400×560 marquee
promo tiles. Listing-only images live in `store_artifacts/`; shipped icons live in the extension
source. Every asset comes from a **committed, deterministic generator script** — regenerate and
commit, never hand-edit a generated PNG. The generator's tech is the repo's choice (the
reference repo draws with stdlib-only Python; CrosswordChat rasterizes SVG/HTML with headless
Chromium); what's fixed is that every asset is reproducible from the repo.

**Layout** — release machinery lives in `dev/build/release/`: the zip builder + shipping-set
module (with its test), and `store_artifacts/` (`PRIVACY.md`, listing screenshots, icon/asset
generators). The patch-bumper and shipped-paths filter that used to live here are **gone** — they
are pack logic now (vendored). No per-repo release doc: the concrete names and paths live in
`manifest.json`/`package.json` and the required `.github/release.config`, and the shared procedure
lives once, in this guide — a repo copy would only drift from it.

## README template

Every extension repo's README carries these two sections, same wording, repo values filled in:

```markdown
## Install

**[Install from the Chrome Web Store →](<store listing URL>)**

Or load the latest development build:

1. Download [the latest release zip](https://github.com/<owner>/<repo>/releases/latest/download/<zip>)
   and extract it — it unpacks to a folder with `manifest.json` at its top.
2. Open `chrome://extensions`, enable **Developer mode** (top right), click
   **Load unpacked**, and select that folder.

## Releasing

The version users see is [`<manifest path>`](<manifest path>)'s `version`. Merging a version
bump to `main` cuts GitHub Release `vX.Y.Z` with `<zip>` attached, and the daily auto-release
ships shipped-file changes to the Chrome Web Store on its own (patch-bumping as needed).
```

Until the extension's first store publication, replace the store line with:

```markdown
*Not yet on the Chrome Web Store — the listing goes live after the first manual publish (tracked
in the repo's first-publication issue).*
```

## Setting up a new extension repo

1. Declare the pack in `.claudinite-checks.json`; baselining then **vendors the release set** — the
   [orchestrator](stubs/workflows/chrome-extension-release.yml) plus the reusable workflows under
   [`stubs/workflows/`](stubs/workflows/) and the composite actions under
   [`stubs/actions/`](stubs/actions/) — into this repo's own `.github/`. (Setting up before the next
   nightly pass? Copy those two trees yourself; there are no tokens to replace.) Then write the
   **required** `.github/release.config` (dotenv) with **all five** keys, explicitly — no defaults:
   `manifest_path`, `package_json_path`, `setup_command` (`""` = no install), `test_command`,
   `ship_paths`. (The build is always `npm run build`, and the zip lives at the derived
   `dist/<kebab repo name>.zip`, so neither is a key.) If the build bakes in per-environment config,
   uncomment the `build_env` block on the `create-package` and `daily` jobs of the orchestrator (the
   only vendored file a repo edits) and set the matching repository **variables** (see step 5).
2. Create `dev/build/release/` — zip builder + shipping-set module (with its test) and
   `store_artifacts/` with `PRIVACY.md` and the icon/asset generators — adapting from the reference
   repo's `dev/build/release/`. **No** per-repo patch-bumper or shipped-paths filter (those are
   vendored pack logic now); a curated shipping set is expressed as `ship_paths` in `release.config`, kept honest
   against the build by the repo's own ship-set test. No `releasing.md` and no `STORE-LISTING.md`:
   the release procedure lives in this guide, and the listing copy / permission justifications are
   dashboard state (above).
3. Wire `npm run build` to produce the zip at the standard `dist/<kebab repo name>.zip` (a monorepo
   sets a root `build` that delegates, e.g. `npm --prefix client run build`) and set `test_command`
   to the repo's full release gate. Add the two README sections above.
4. One-time GitHub setup: Pages → Source = "GitHub Actions". The four `CHROME_*` secrets come
   later, after the first manual publish. (No cross-repo Actions access to configure — the whole
   pipeline is vendored, so it never calls another repo's reusable workflows.)
5. Open the **first-publication tracking issue** (idempotent — search the tracker first, skip if
   one already exists, open or closed) so the one-time manual setup below is tracked as state, not
   carried as a repo file. Its checklist:
   - Set the four `CHROME_*` **secrets** (minted below) — Settings → Secrets and variables →
     Actions → Secrets.
   - **Only if the orchestrator uses `build_env`**: set the repository **variables** it references. These
     are automatable where API access exists — the issue carries a ready-to-run script, e.g.
     `gh variable set API_BASE_URL --repo <owner>/<repo> --body "https://…"` (repeat per key) —
     rather than a click-through, so the one manual part is minting the store credentials, not
     copying config into Settings.
   - Do the "First publication" steps below, then close the issue. From then on the daily pipeline
     owns routine shipping.

> A repo's **own** first-publication runbook — a go-live checklist, an account/credentials setup
> guide — is the same do-then-close artifact by another name: first-publication *guidance*, not
> standing reference. Once the extension is live it's spent; fold anything durable into the
> standing architecture/README docs it already defers to, then remove the file. (That a cleanup
> makes you fix references *into* such a doc is the cue to ask whether the doc itself is in scope
> for removal — not to polish it.)

## Manual actions — publishing to the Chrome Web Store

The steps the automation cannot do, distilled from the path actually run for the reference
extension; the upstream reference is
[Using the Chrome Web Store Publish API](https://developer.chrome.com/docs/webstore/using-api).

### First publication (once per extension)

1. Register a developer account at the
   [developer dashboard](https://chrome.google.com/webstore/devconsole) (one-time $5 fee).
2. **Add new item** → upload the release zip. If the extension pins its ID with a manifest
   `key` (needed when OAuth redirect URIs depend on a stable ID — see
   [the chrome-extension pack RULES](../chrome-extension/RULES.md)), the **first** upload must NOT contain the
   `key`: the store assigns the ID at first upload, and you copy the dashboard's Package-tab
   public key back into the build afterwards. Record the 32-char item ID → the
   `CHROME_EXTENSION_ID` secret.
3. Complete the listing — 128px store icon, name, summary, detailed description, category,
   ≥ 1280×800 screenshot — authoring the copy **directly in the dashboard** (this is where it
   lives; the repo keeps no copy). Screenshots and icons come from `store_artifacts/`.
4. Privacy tab: write the single-purpose statement, a justification for **every** permission the
   manifest requests, and the data-usage declarations, directly in the dashboard; set the
   **Privacy policy** field (bottom of the tab) to the `/privacy/` Pages URL — the same policy
   `PRIVACY.md` deploys. **Before submitting**: bring the privacy page up by running the **Release**
   workflow once with **mode: publish** — its privacy-deploy leg runs even though the store-upload leg
   fails at this stage (no store item or secrets yet — the designed pre-publication state), so the
   `/privacy/` page goes live. Load the URL in a browser to confirm it's live, and paste that exact
   permalink — never a guessed path. Google re-fetches this URL on **every** publish, and an
   unreachable link fails the publish (see [When a store publish fails](#when-a-store-publish-fails)).
5. Submit for review — approval takes hours to a few days (`ITEM_PENDING_REVIEW` = success).
   While the item is **pending review the API rejects uploads** — hold the pipeline dry run
   until the first review completes. Every subsequent upload must carry a **strictly higher**
   version, which is why the pipeline always bumps before it ships; a "version must be
   greater" rejection on a dry run is a **pass** — it proves the credential wiring works
   end to end.

### Minting the API credentials (once per extension)

Browser-only — no local tooling needed. Two standing rules for every step below:

- Every "sign in with Google" must use the **same Google account that owns the store listing**,
  and will hit a **"Google hasn't verified this app"** interstitial — click **Advanced** →
  **"Go to \<app\> (unsafe)"** → **Allow**. That's fine and permanent: you are this OAuth app's
  only user, so **ignore every verification prompt and never start verification** — an
  unverified app's tokens work indefinitely.
- Before acting on any Cloud-console page, confirm the **top-bar project picker** shows the
  project created in step 1.

**Google Cloud setup:**

1. **Create a project**: <https://console.cloud.google.com/projectcreate> — any name, keep
   "No organization" → **Create**. Confirm the top-bar project picker switched to it.
2. **Enable the Chrome Web Store API**:
   <https://console.cloud.google.com/apis/library/chromewebstore.googleapis.com> → **Enable**.
3. **Configure the OAuth consent screen** (the console now brands this "Google Auth
   Platform"): <https://console.cloud.google.com/auth/overview> → **Get started** → app name +
   support email → Audience: **External** → contact email → agree → **Create**.
4. **Publish the app to production**: <https://console.cloud.google.com/auth/audience> →
   **Publish app** → **Confirm**. Left in "Testing", refresh tokens silently expire after
   7 days — the unattended daily release dies a week later.
5. **Create the OAuth client**: <https://console.cloud.google.com/auth/clients> → **Create
   client** → type **Web application** (NOT Desktop — Desktop clients can't take custom
   redirect URIs; the client type makes no difference to `chrome-webstore-upload-cli`, the
   refresh-token grant is identical) → add authorized redirect URI exactly
   `https://developers.google.com/oauthplayground` → **Create**. The client ID and secret are
   `CHROME_CLIENT_ID` / `CHROME_CLIENT_SECRET`.

**Mint the refresh token in the OAuth 2.0 Playground:**

1. Open <https://developers.google.com/oauthplayground> → gear icon (top right) → check
   **Use your own OAuth credentials** → paste the client ID + secret.
2. In Step 1, ignore the API list: type `https://www.googleapis.com/auth/chromewebstore` into
   **Input your own scopes** → **Authorize APIs** → sign in as the listing owner → past the
   unverified interstitial → **Allow**.
3. Step 2 → **Exchange authorization code for tokens** → copy the **Refresh token** (starts
   `1//`). Ignore the access token — it expires hourly; the CLI mints its own.
4. **Empty Refresh-token field?** Consent wasn't force-prompted: in the gear panel set
   **Force prompt: Consent** and redo the authorize step.

Add all four values as repository secrets at
`https://github.com/<owner>/<repo>/settings/secrets/actions/new`:
`CHROME_EXTENSION_ID`, `CHROME_CLIENT_ID`, `CHROME_CLIENT_SECRET`, `CHROME_REFRESH_TOKEN`.

**Alternative — local Node**: `npx chrome-webstore-upload-keys` walks the same flow from a
terminal (it needs the client to be a **Desktop app**, whose `http://localhost` redirect it
uses). Use it only when a Node-equipped machine is at hand; the Playground route above is the
default because it assumes nothing about the operator's machine.

### Routine shipping

- Nothing to do for accumulated work: the daily auto-release ships any day whose merges touched
  shipped files, on its own patch bump.
- A deliberate release now: **"bump version"** (default minor) → merge the PR (that cuts the
  GitHub Release) → run the **Release** workflow with **mode: publish** from its dispatch page,
  `https://github.com/<owner>/<repo>/actions/workflows/chrome-extension-release.yml` (blank tag = latest release).
- Once the store approves, Chrome auto-pushes the update to installed users within hours — no
  reinstall.

### When a store publish fails

- **HTTP 400 `Publish condition not met: Privacy policy link is not reachable.`** — Google
  fetches the listing's privacy-policy URL at publish time, and re-checks it on **every**
  publish. Fix it on the item's **Privacy** tab in the
  [developer dashboard](https://chrome.google.com/webstore/devconsole)
  (`https://chrome.google.com/webstore/devconsole/<publisher-id>/<item-id>/edit/privacy`,
  bottom field, "Privacy policy"): set it to the exact live `/privacy/` permalink → **Save
  draft** → re-run the publish.
- **Upload rejected while `ITEM_PENDING_REVIEW`** — the API can't upload while a review is in
  flight; wait for the review to complete, then re-run.
- **"version must be greater" than the live one** — expected whenever the zip's version isn't
  strictly higher; on a credentials dry run this is success, otherwise let the daily bump (or
  "bump version") raise it first.

### When a change touches the extension's permissions

Any PR that changes the manifest's `permissions`, `host_permissions`, or `optional_*`:

1. Disclose the permission in `PRIVACY.md` in the **same PR** — the deployed privacy policy must
   reflect what the extension can access. `cer/privacy-permission-alignment` blocks the change
   until it does.
2. Adding a permission trips `cer/permission-added-store-issue` (advisory): open a tracking issue
   for the manual dashboard step — the Privacy-practices tab must carry a written justification
   for the new permission, and the store blocks publishing the new version until it does, so the
   next store publish (daily or manual) stalls on it. (If the daily pipeline hits it first, the
   failed publish lands on its `workflow-failure` tracking issue; the proactive issue beats the
   reactive one.) After updating the dashboard, re-run the publish.
3. Expect deeper store review than a plain code update — permission changes re-open scrutiny.
4. A new **required** permission that carries an install-time warning disables the extension
   for existing users until each one re-approves it — prefer `optional_permissions` /
   `optional_host_permissions` requested at runtime (`chrome.permissions.request`) when the
   feature allows.
