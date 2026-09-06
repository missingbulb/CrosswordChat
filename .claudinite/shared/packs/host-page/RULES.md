# Adapting to a host page

Code running inside a web app somebody else owns. The premise underneath every rule here: **the
host will change its markup without telling you, and your code will not throw when it does.** A
selector that matches nothing returns null; a click on a renamed button never happens. These
rules make that failure loud, local and cheap to fix.

## Reading the host

- **Reaching into the host's DOM from anywhere** — put every selector, class string and
  structural assumption behind one module, exposing an interface in your own vocabulary
  (a snapshot in, an action out) so the rest of the code never learns the page exists. A
  redesign then costs one directory, its blast radius is knowable before you start, and
  everything outside it becomes testable without a browser. Enforce the boundary by token —
  fail the build if the host's class prefix appears outside that module — since the discipline
  is what makes the rest true. (1)

- **Identifying an element on the host** — cast a net, don't bet on one class name: a family
  matcher (`[class*="toolbar"]`) over an exact one, attribute and role hooks the host churns
  less often (`role="cell"`, `data-testid`, `aria-label`), and a text-or-shape fallback
  underneath ("a visible container whose text says X with a button in it, whatever its classes
  are called"). Make visibility part of identity — hosts keep dismissed modals in the DOM, so a
  match that ignores `display`/`visibility`/zero-size keeps reporting a splash you already
  cleared.

- **Editing the file that holds those selectors** — record what you verified them against and
  when: the date, the page, the captured markup you read them from, and above all the
  **negative** findings (this state class sits on the `<rect>` and not the `<g>`; that button
  exposes no `aria-pressed` and no class change; those text nodes carry no distinguishing
  class). It is the one file in your codebase whose truth lives on somebody else's server, and
  each of those negatives is an hour nothing else in the repo can give back. (2)

## Proving it still works

- **Shipping any of this to users** — ship a probe with it: one entry point that reports the
  health of every selector against the live page, reachable from your own UI. It turns "it
  stopped working" into "the clue-list wrapper selector matches 0, want 2". It must **never
  throw** — a probe that dies on the first missing element reports one fault and hides the
  other nine — so collect a row per selector and return them all, and have it capture forensics
  for what you could *not* read, so the next report arrives with the evidence already in it.

- **Testing the read/write/watch cycle** — mirror the host in a saved, simplified fixture that
  matches your selectors exactly, and drive that in CI. Its limit is the same as its virtue:
  **the fixture only ever shows you the markup you already knew about**, so a passing suite is
  never evidence about the live page. Keep a manual-test document for what only the real host
  can answer, and treat every live finding as a fixture update.

## Driving the host

- **Writing into the host** — address the target by position rather than trusting the host's
  own cursor conventions, then **read the DOM back and confirm what you meant is there**. The
  host may ignore untrusted events, auto-advance differently than you assumed, or reject the
  input silently, and the re-read is the only thing that separates those from success. Poll the
  re-read rather than doing it synchronously after the last dispatch — the host renders
  asynchronously, so the DOM immediately after your event is the DOM *before* the app processed
  it.

- **Dispatching a synthetic keystroke** — mirror what a real one carries, including the
  deprecated fields: the browser fills `keyCode`/`which`/`charCode` on every real keystroke,
  while on a synthetic one they are plain init fields defaulting to 0, and a host with a
  long-lived key-handling layer still branches on them. A 0 matches nothing, so the handler
  runs and nothing happens — indistinguishable from "the app ignores untrusted events". Send
  the full keydown → keypress → keyup sequence, and build the init in **one helper** spread at
  a single dispatch site, so fidelity is one function's job. (3)

- **Toggling a host control to do your work** — put it back afterwards, and design for not
  being able to read it. You will often be unable to tell what state you are toggling (a button
  with no `aria-pressed` and no class change makes "on or off?" genuinely unanswerable), so
  treat the unreadable case as the **normal** one: fall back to click parity and let the
  feature that depends on it degrade, rather than failing the operation.

## Sharing the page

- **Watching for host changes** — check the host's own overlay states **before** diffing.
  Veils, pause screens and modals blank the content, and a watcher that diffs first reads that
  as the user having cleared everything; report the state once and return. Absence of the
  content is not absence of the app either — a pre-content splash can keep the real markup out
  of the DOM for minutes.

- **Building anything the user drives by voice, gesture or automation** — expect the host's own
  idle timers to fire, because your user is active and the host cannot tell. Nudge it with a
  real event that mutates nothing (a bare `Shift` keydown/keyup), and drive that nudge from
  real user activity, never from a timer of your own: when the user really has gone quiet, the
  host *should* time out and your session should end with it.

- **Loading on the host's page at all** — doing nothing is the resting state, because your code
  loads whether or not the user is using you. Create watchers on demand and stop them with the
  session; poll nothing and observe nothing in between. Keep load-time page changes to an
  explicit, minimal carve-out, mount it with an observer that **disconnects the moment the
  element lands**, and give up only when the host shows no app markup at all — a slow render
  must not cost you the mount, and a page the app never loads on must not leave you waiting
  forever.
