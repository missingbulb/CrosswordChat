---
name: extension-host-permissions
description: Getting a content script onto third-party pages without an install-time host warning — optional_host_permissions, chrome.permissions.request inside a user gesture, dynamic registration, and reconciling the grant on every worker start. Use when a content script must run on arbitrary sites, or when editing a manifest's permissions.
metadata:
  force-load-on-file-edits-paths:
    - "**/manifest.json"
---

# Runtime host permissions

- **Running a content script on arbitrary third-party pages without an install-time host warning**
  — request access at runtime: declare the origins under `optional_host_permissions` plus the
  (silent) `scripting` permission, call `chrome.permissions.request()` **synchronously inside a real
  foreground user gesture** (Chrome rejects the request from a service-worker message handler), then
  register the script dynamically with `chrome.scripting.registerContentScripts()` — never a
  static `content_scripts` entry.

- **Starting the service worker when a runtime-granted permission is in play** — reconcile your
  stored enabled-flag against the permission actually granted and re-register (or clean up) to
  match, on every start. The grant can be revoked from `chrome://extensions` out from under you.
