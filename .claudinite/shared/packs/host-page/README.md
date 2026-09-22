# host-page

Being a guest in a web app you do not own: reading its DOM, driving it with synthetic input,
watching it change, and injecting your own UI into it — against markup that can be redesigned
without notice and code that will not throw when it is.

Sibling packs on the same axis: `web-scraping` (acquiring a site's data from outside it, rather
than operating it from within), `chrome-extension` (how your code reaches the page at all —
manifest, permissions, content-script registration), `headless-browser` (driving a browser you
own, from outside the page).

There is no fingerprint: declaring the pack is the only thing that activates it.

## Rules (`RULES.md`)

| Rule | Severity | Reason | Enforcement |
|---|---|---|---|
| Quarantine host DOM knowledge in one module | high | complexity | prose: <100 words |
| Identify host UI by a net | high | correctness | prose: <100 words |
| Record what selectors were verified against | medium | complexity | prose: <100 words |
| Ship a probe that never throws | medium | correctness | prose: <200 words |
| Mirror the host in a fixture | medium | correctness | prose: <100 words |
| Verify every write by re-reading | critical | correctness | prose: <100 words |
| A synthetic keystroke carries the legacy fields | high | correctness | prose: <100 words |
| Restore borrowed host state | medium | correctness | prose: <100 words |
| Check the host's overlay states before diffing | high | correctness | prose: <100 words |
| Nudge the host's idle timers | medium | correctness | prose: <100 words |
| Be inert when you are off | high | performance | prose: <200 words |

## Checks

| Check | Severity | Reason | Enforcement |
|---|---|---|---|
| `page-observers-disconnected` | high | performance | check: blocking |
| `synthetic-input-events-bubble` | high | correctness | check: blocking |
| `synthetic-input-events-target-app-node` | high | correctness | check: blocking |

What each demands: a file that starts a DOM observer on the page disconnects one somewhere in
that same file; a synthetic input event is constructed with `bubbles: true`; and its target is a
node inside the app root rather than `document` or `document.body`. All three are scoped to the
event interfaces that model real user input, so a `CustomEvent` you dispatch to your own listener
is left alone, and all three strip comments before matching. Everything else in `RULES.md` stays
prose.
