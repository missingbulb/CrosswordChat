# chrome-extension pack

Active when a `manifest.json` declares `manifest_version` — the MV3 build/runtime gotchas that apply while you're *coding* an extension. Prose only (`RULES.md`), no checks.

Releasing and Chrome-Web-Store publication are a separate, opt-in concern: the [`chrome-extension-release`](../chrome-extension-release/README.md) pack (its `RELEASE.md` standard + conformance checks), declared when the project is ready to ship.

## Prose gotchas (`RULES.md`)

| Rule (≤5 words) | How enforced |
|---|---|
| MV3 worker paths must be root-absolute | prose |
| SetIcon needs imageData, not path | prose |
| Injected shared global: augment, not replace | prose |
| CDP-introspecting an MV3 worker traps | prose |
| JWT auth via launchWebAuthFlow id_token | prose |
| MV3 loads ES modules natively | prose |
| Silent token refresh needs prompt=none | prose |
| host_permissions does not bypass CORS | prose |
