# host-page

Being a guest in a web app you do not own: reading its DOM, driving it with synthetic input,
watching it change, and injecting your own UI into it — against markup that can be redesigned
without notice and code that will not throw when it is.

Sibling packs on the same axis: `web-scraping` (acquiring a site's data from outside it, rather
than operating it from within), `chrome-extension` (how your code reaches the page at all —
manifest, permissions, content-script registration), `headless-browser` (driving a browser you
own, from outside the page).

Declared by hand: there is no honest fingerprint for it. A content script, a `dispatchEvent`
and a `MutationObserver` are equally the shapes of code running on its own page, so a marker
that cannot tell a guest from a host would suspect the pack in every DOM repo in the fleet.

## Rules (`RULES.md`)

| Rule | Severity | Reason | Enforcement |
|---|---|---|---|
| Quarantine host DOM knowledge in one module | high | complexity | prose: 96 words |
| Identify host UI by a net | high | correctness | prose: 85 words |
| Record what selectors were verified against | medium | complexity | prose: 93 words |
| Ship a probe that never throws | medium | correctness | prose: 101 words |
| Mirror the host in a fixture | medium | correctness | prose: 76 words |
| Verify every write by re-reading | critical | correctness | prose: 91 words |
| A synthetic keystroke carries the legacy fields | high | correctness | prose: 97 words |
| Restore borrowed host state | medium | correctness | prose: 78 words |
| Check the host's overlay states before diffing | high | correctness | prose: 68 words |
| Nudge the host's idle timers | medium | correctness | prose: 77 words |
| Be inert when you are off | high | performance | prose: 102 words |

## Checks

| Check | Severity | Reason | Enforcement |
|---|---|---|---|
| `page-observers-disconnected` | high | performance | check: blocking |
| `synthetic-input-events-bubble` | high | correctness | check: blocking |
| `synthetic-input-events-target-app-node` | high | correctness | check: blocking |

Three checks, one shared failure mode: each catches a breach whose only symptom is the host page
**not responding**. `dispatchEvent` returns true, nothing throws and nothing logs, so a reader
cannot tell any of them from "the app rejects untrusted events" — the wrong conclusion, and an
expensive one to back out of. That is what earns them a scan rather than prose. Each is
deliberately narrow: the observer rule asks a file-scoped question rather than attempting
data-flow analysis, and both event rules are scoped to the interfaces that model real user input,
so a `CustomEvent` you dispatch to your own listener is left alone. Everything else in `RULES.md`
stays prose — judgment about a host whose markup this repo cannot see.
