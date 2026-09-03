# Chrome extensions

> **Releasing, versioning, and Chrome Web Store publication are standardized** — before building
> or changing any release/publish machinery in an extension repo, read the
> [chrome-store-releases standard](skills/chrome-store-releases/SKILL.md) and copy its canonical
> workflows instead of re-deriving them.

## Service worker

- **Handing a path to a Chrome API or `fetch` from an MV3 service worker** (`importScripts`,
  `action.setIcon`) — make it extension-root absolute: a leading slash, or
  `chrome.runtime.getURL(...)`. A worker's relative paths resolve against the worker's **own** file
  location, not the extension root, and a bare relative path fails silently — it can abort the
  worker on import, or make an API call reject while the worker keeps running.

- **Wanting `import`/`export` in extension code** — MV3 loads ES modules natively; don't add a
  bundler just to use them. Declare the service worker `"type": "module"` and load page/side-panel
  scripts with `<script type="module">`; relative imports resolve within the packaged extension.
  Content scripts are the exception — they are classic scripts, below.

## Content scripts

- **Assembling a shared global from several injected content-script files** — **augment** it,
  never replace it: merge onto it (e.g. `Object.assign`), not `globalThis.X = {...}`. The files are
  re-injected into the page on every activation (e.g. every popup open), so replacing makes each
  newly-injected file wipe what earlier files already attached.

- **Accumulating state in a file that is re-injected** (e.g. a list a source pushes into) — reset
  it at load time.

- **Loading ES module code into a content script** — register a tiny **classic loader** whose only
  statement is a *dynamic* `import(chrome.runtime.getURL('…'))`. A **registered or static content
  script runs as a *classic* script — it can't be an ES module**:
  `chrome.scripting.registerContentScripts` and static `content_scripts` inject their files as
  classic scripts (there is no `type: 'module'` mode, unlike a page's `<script type="module">` or
  the module service worker), so a top-level `import` in one throws
  `Uncaught SyntaxError: Cannot use import statement outside a module` — **in the host page's
  console, not the extension's**. Dynamic `import()` is legal in a classic script, and the module it
  pulls in runs in the same content-script isolated world with the content-script `chrome.*` surface
  intact.

- **Adding an import to a content-script module** — list that module **and its whole transitive
  import graph** under `web_accessible_resources` (gated to the target origins), or the fetch is
  blocked.

- **Keeping that `web_accessible_resources` list correct** — have a test walk the import graph
  from the entry module, so a newly-added import can't silently fall out of the list.

## Permissions and host access

- **Matching a host with `chrome.events.UrlFilter`** — its host operators are **raw string
  matches, not domain-boundary matches**: `hostSuffix: "example.com"` also matches
  `evilexample.com`, and `declarativeContent`'s `PageStateMatcher.pageUrl` gates an action icon or
  page condition on exactly these filters. To mean *apex-or-any-subdomain*, combine
  `hostEquals: "example.com"` with `hostSuffix: ".example.com"` (the leading dot forces a label
  boundary); never gate a security- or origin-sensitive behavior on a bare `hostSuffix`.

- **Running a content script on arbitrary third-party pages without an install-time host warning**
  — request access at runtime: declare the origins under `optional_host_permissions` plus the
  (silent) `scripting` permission, call `chrome.permissions.request()` **synchronously inside a real
  foreground user gesture** (Chrome rejects the request from a service-worker message handler), then
  register the script dynamically with `chrome.scripting.registerContentScripts()` — never a
  static `content_scripts` entry.

- **Starting the service worker when a runtime-granted permission is in play** — reconcile your
  stored enabled-flag against the permission actually granted and re-register (or clean up) to
  match, on every start. The grant can be revoked from `chrome://extensions` out from under you.

- **A fetch to a host you listed failing in-browser** — `host_permissions` does not bypass CORS.
  Listing a host lets the extension's fetches *reach* it, but the server must still return CORS
  headers for the extension origin (`chrome-extension://<id>`) or the request fails.

- **Reaching your *own* backend** — don't add a `host_permissions` entry merely for that: if it
  already returns permissive CORS the fetch succeeds without one, and the entry only adds a scary
  install-time host-access warning.

## Sign-in and tokens

- **Authenticating an extension to a JWT-validating backend** (an API Gateway JWT authorizer, any
  OIDC-validating server) — obtain a Google **ID token** with `chrome.identity.launchWebAuthFlow`
  (`response_type=id_token`) against a Google Cloud OAuth client of type **Web application**,
  redirect to `https://<extension-id>.chromiumapp.org/` (from `chrome.identity.getRedirectURL()`),
  scope `openid email profile`, and **verify the returned `nonce`**. Pin the extension id with a
  manifest `key` so the redirect URI stays fixed. Do **not** use `chrome.identity.getAuthToken` —
  it returns an opaque OAuth *access* token (no verifiable signature/`iss`/`aud`) that a JWT
  authorizer rejects.

- **Refreshing a token silently** (`launchWebAuthFlow({interactive:false})`) — request
  `prompt=none`. `prompt=consent` always needs interaction and therefore always fails silently —
  reserve it (or omit `prompt`) for the interactive fallback.

- **Refreshing silently with more than one account signed in** — pass the remembered account's
  email as `login_hint`; otherwise the provider can't tell which session to reuse and forces an
  interactive account-picker. Persist the non-secret email from the first successful sign-in.

- **Storing a token** — extension storage is unencrypted, so treat tokens as secrets at rest: keep
  the bearer/ID token in in-memory `chrome.storage.session` (cleared on browser exit) and persist
  only non-secret identifiers (e.g. the account email) to `chrome.storage.local`.

- **Wanting a token to survive a browser restart** — re-run the silent flow; don't switch to a
  refresh-token flow just for that, which puts a longer-lived credential on disk.

## Extension UI surfaces

- **Knowing whether your side panel is open** — have the panel open a `Port` on load and read its
  connect/disconnect as open/closed. MV3 gives the side panel no is-open/close API, and an action
  popup suppresses `action.onClicked`.

- **Opening the side panel programmatically** — `chrome.sidePanel.open()` needs Chrome 116+, so
  raise `minimum_chrome_version` accordingly.

- **Putting a menu on the toolbar icon itself** — create it with
  `chrome.contextMenus.create({ contexts: ['action'], … })`; the `contextMenus` permission carries
  **no** install-time warning (unlike a broad host permission).

- **Recreating those menu items on install or startup** — call `contextMenus.removeAll()` first,
  so they self-heal instead of throwing on duplicate ids when the service worker re-runs its top
  level.

## Introspecting a service worker over CDP

- **Awaiting a `chrome.*` callback API inside `Runtime.evaluate`** — don't: they don't reliably
  settle when awaited with `awaitPromise: true` (a hang with no internal timeout). Build the awaited
  signal from plain promises (`fetch`/`OffscreenCanvas`) instead.

- **Reading a worker value from an injected evaluate** — a bare top-level `function`/`const` isn't
  reachable from one, so expose what the probe reads as an explicit `globalThis.x = …`.

- **Attaching to a dormant worker** — poll for the global rather than reading it once immediately
  after attaching. A dormant worker has no globals until it re-runs its top level, and attaching to
  it is what starts that.
