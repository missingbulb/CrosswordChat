# chrome-extension pack

Active when a `manifest.json` declares `manifest_version` — the MV3 build/runtime gotchas that apply while you're *coding* an extension. Mostly prose (`RULES.md`); the gotchas with a static signature in the source are checks.

Releasing and Chrome-Web-Store publication are a separate, opt-in concern: the [`chrome-extension-release`](../chrome-extension-release/README.md) pack (its `RELEASE.md` standard + conformance checks), declared when the project is ready to ship.

## What the pack carries

The gotchas themselves live in [`RULES.md`](RULES.md), grouped by the surface each concerns —
service worker, content scripts, permissions and host access, sign-in and tokens, extension UI
surfaces, and introspecting a service worker over CDP. This file doesn't index them: a second copy
of the rule list is a duplicate that drifts, and this one had, claiming a prose rule that never
existed (#777).

Two of those gotchas have a static signature in the source and are enforced by a check as well:

| Check | Enforces |
|---|---|
| `content-script-module-syntax` | a content script is a classic script, so its top-level `import` throws — prose in `RULES.md` too |
| `declarative-content-set-icon` | a `declarativeContent.SetIcon` action supplies `imageData`, never `path` — carried by the check alone; the rule's whole account is its `why` and `fix` |
