# Adapting to a host page — the judgment core

Working inside a web app you do not own: reading its DOM, driving it with synthetic input,
watching it change, and putting your own UI into its chrome. The mechanical rules — that a
page observer is disconnected, that a synthetic input event bubbles, that it is aimed somewhere
inside the app's own subtree — are this pack's three checks; what follows is only what no check
can decide for you.

Each rule below is a judgment about being a guest in someone else's page, and holds for any
code that does it — a userscript, an automation layer, an extension's content script. Where
one cites this repo — a file, a requirement id, a date — that is the **evidence** it was drawn
from, not the scope it applies to.

The premise underneath all of it: **the host will change its markup without telling you, and
your code will not throw when it does.** A selector that matches nothing returns null; a click
on a renamed button never happens. Every rule here is about making that failure loud, local,
and cheap to fix.

## Quarantine the host's DOM knowledge in one module

All of it, behind an interface expressed in your own vocabulary — here `page-adapter/` returns
a `Snapshot` and takes `enterAnswer`, and the crossword model, the dialog policy and the
matcher never learn that the page exists (REQ-PAGE-011, `dev/docs/ARCHITECTURE.md` §2). Two
things follow, and both are worth the discipline:

- A redesign is a **one-directory** change, and the blast radius is knowable before you start.
- The rest of the codebase becomes testable without a browser at all — the pure layers here
  (`puzzle-model/`, `matching/`, `conversation/`) are pure *because* the quarantine holds.

Inside that module, put **every selector and class string in one file**, and change values only
there (`page-adapter/selectors.js`). A selector inlined at its use site is the one that gets
missed when the host renames a class.

Enforce the quarantine mechanically, by token: the repo's arch test fails if the host's class
prefix (`xwd__`) appears in code outside `page-adapter/`.

## Identify host UI by a net, not by a selector

A single selector is a bet that one class name survives. Cast a net instead, and make the last
strand semantic:

- class nets that accept a family (`[class*="xwd__toolbar"]`), not one exact name;
- attribute and role hooks the host is less likely to churn (`role="cell"`, `data-testid`,
  `aria-label`);
- and a **text/shape fallback** underneath: the splash is found by class net *or* by "a visible
  container whose text says 'Ready to start solving' with a Play-ish button in it, whatever its
  classes are called" (`page-adapter/splash.js`); the pause veil is found by its copy plus
  visibility (`reader.js isPaused`).

Visibility is part of identity. Hosts keep dismissed modals in the DOM, so a match that ignores
`display`/`visibility`/zero-size will keep reporting a splash you already cleared.

## Write down what you verified the selectors against, and when

The selectors file is the only place in the codebase whose truth lives on someone else's
server, so it carries its own provenance: the date and page it was last verified against, the
captured markup it was read from, and — most valuable — the **negative** findings.
`selectors.js` records that the state classes sit on the `<rect>` and not the `<g>`, that the
pencil button exposes no `aria-pressed` and no class change, that the letter/number `<text>`
nodes carry no distinguishing classes and the class-based selectors match nothing live. Each of
those is an hour of somebody's life, and none of it is recoverable from the code.

## Ship a probe, and make a broken page a finding rather than an exception

One entry point that reports the health of every selector against the live page —
`page-adapter/probe.js`, REQ-PAGE-009, run from the in-page menu (MT-01). It is the first thing
to run when a user says "it stopped working", and it turns "the extension is broken" into "the
clue-list wrapper selector matches 0, want 2".

It must **never throw**: a probe that dies on the first missing element reports one fault and
hides the other nine. Collect a row per selector and return them all — and have it capture
forensics for the things you could *not* read (the probe here dumps the pencil button's
attributes precisely because its ON state has never been readable), so the next report arrives
with the evidence already in it.

## Mirror the host in a fixture, and let the fixture define the expected shape

A saved, simplified copy of the host page (`extension-test/fixtures/fake-nyt/`, served by
`npm run fixture`) mirrors the selectors exactly, and the integration tests drive that. It buys
two things a live page cannot: the read/write/watch cycle is testable in CI at all, and the
whole voice loop is rehearsable locally without a subscription (`npm run build:dev` widens the
matches to `localhost:8787`, MT-23).

Its limit is the same as its virtue — **the fixture only ever shows you the markup you already
knew about**, so a passing suite is never evidence about the live page. Keep a manual-test
document for what only the real host can answer (`dev/docs/MANUAL-TESTS.md`), and treat every
live finding as a fixture update.

## Never trust a write — verify by re-reading

Address the target by position rather than relying on the host's own cursor conventions (click
each cell, then type one letter — immune to the host's advance-on-type and skip-filled
settings), then **read the DOM back and confirm what you meant is there** (REQ-PAGE-007). The
host may ignore untrusted events, may auto-advance differently than you assumed, may reject the
input silently; the re-read is the only thing that distinguishes those from success.

Poll the re-read, don't do it synchronously after the last dispatch: the host renders
asynchronously (React here), so the DOM immediately after your event is the DOM *before* the
app processed it. And aim your events at a node **inside the app's own subtree** — the selected
element if it has focus, otherwise a known app node. A modern app delegates key handling near
its root, which is a descendant of `<body>`, so an event dispatched at `document` or `body`
bubbles *past* it and is never seen (`page-adapter/writer.js`). That last half is the
`input-events-target-app-subtree` check — but only its negative: which node you aim at instead,
and polling the re-read, are yours.

## A synthetic keystroke must carry the fields a real one would

The browser fills in the deprecated `keyCode`/`which`/`charCode` on every real keystroke; on
a synthetic one they are plain init fields that default to 0, so
`new KeyboardEvent('keydown', { key: 'A' })` reaches the page as a keystroke whose keyCode is
0. Deprecated is not the same as unread: hosts with a long-lived key-handling layer still
branch on the legacy fields — this one does (verified live, MT-02) — and a 0 matches nothing,
so the handler runs and nothing happens, indistinguishable from "the app ignores untrusted
events". Mirror the real event instead: `keyCode` and `which` alongside `key`/`code`,
`charCode` on `keypress`, and the full keydown → keypress → keyup sequence a real keystroke
produces (`page-adapter/writer.js` `keyEventInit`/`typeKey`).

Build the init in **one helper** and spread it at the single dispatch site, so fidelity is one
function's job. That factoring is also why this rule is prose rather than a check: the init a
well-factored adapter dispatches is opaque to a static scan (`{ ...init }` could carry
anything), so a check here could only ever police code that bypasses the helper — and the
mistake in that code is bypassing the helper, not the field it then forgot.

## Put back any host state you borrowed, and degrade when you cannot read it

Driving a host toggle means driving it back: pencil mode is set to match the write and restored
afterwards, so the user's own typing mode is never stolen (REQ-PAGE-012).

You will often be unable to read the state you are toggling — the live pencil button has no
`aria-pressed` and no class change, so "on or off?" is genuinely unanswerable. Design for the
unreadable case as the **normal** one, not the error case: fall back to click parity, and let
the feature that depends on it degrade (the letters still land; only the pencil softening is
lost, REQ-ANS-019) rather than failing the operation.

## The host has a lifecycle of its own, and its blank states are not your user's doing

You are sharing the page with an app that has its own timers, veils and modals, and each one
looks like something else from inside your adapter:

- **Idle timers.** This host auto-pauses a quiet puzzle after ~30 s of no keyboard input. A
  voice solver touches no keyboard, so the adapter sends a bare `Shift` keydown/keyup on every
  heard command — a real key event that types nothing and moves nothing (REQ-LIFE-017). Choose
  the nudge so it cannot mutate state, and drive it from real user activity, never from a timer
  of your own: when the user really has gone quiet, the host *should* pause and your session
  should end with it.
- **Veils that blank the content.** The pause veil empties the visible entries. A change watcher
  that diffs first and checks for the veil second will read that as the user clearing the whole
  grid. Check for the host's own overlay states **before** diffing, report the state once, and
  return (`page-adapter/watcher.js`).
- **Pre-content splashes.** The board may not exist for minutes while a "Ready to start
  solving?" modal is up. Absence of the content is not absence of the app.

## Be inert when you are off

Your code loads on the host's page whether or not the user is using you, so **doing nothing is
the resting state** (REQ-NFR-004). Watchers are created on demand and stopped with the session;
nothing polls; nothing observes between sessions.

Keep load-time page changes to an explicit, minimal carve-out — here exactly one: mounting the
toolbar button (REQ-LIFE-012). Mount it by waiting with a `MutationObserver` that **disconnects
the moment the element lands** (the `page-observers-disconnected` check), and give up only when
the host shows no app markup at all — a slow render or a splash must not cost you the button,
but an archive page must not leave you waiting forever.
