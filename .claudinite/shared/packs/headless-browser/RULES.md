# Headless browser

## Getting a browser

- **Resolve the binary out of the environment; never let the driver download one.** A container
  or runner image that already ships a browser is the normal case, and the driver's own registry
  download is slow, often blocked, and pins a build you did not choose. Look for an explicit
  override variable first, then the image's browser root, then fall through to the driver's own
  resolution — and prefer the driver's `-core` package, which bundles no browser at all. The
  image's build number need not match the driver's own pin for the browser to launch. Never
  hardcode the version-stamped path you found by looking: it moves with the next image, and the
  failure lands on whoever rebuilds rather than on whoever wrote it.

- **A fresh install of the driver package is the same danger from upstream.** Reinstalling the
  package to fix an import error just as easily resolves to a newer release than the one paired
  with the environment's pinned browser — it then hunts for a browser build the image was never
  given and fails asking for a network install the sandbox cannot make. A reinstall run from the
  repo root instead of a scratchpad can dodge that failure outright (a version happens to
  resolve that works) and still cost you: it dirties the tracked `package.json`, its lockfile and
  `node_modules`, which then need a manual revert before anything can be committed. Resolve the
  already-installed package by its global path instead of adding a second copy, at any depth in
  the tree.

- **When a page depends on a third-party library loaded from a CDN you have not vendored,
  stub the library's own API surface rather than trying to make the CDN reachable.** A default
  network abort (above) leaves the page's global for that library undefined, so every call into
  it throws and the render comes back empty — indistinguishable from a product bug unless you
  know the cause. Grep the code under test for the handful of calls it actually makes (a mapping
  or charting library often boils down to a handful of constructors and methods) and install a
  minimal no-op implementation of just those as an init script, before the page's own scripts run.

- **A sandboxed agent's egress proxy can deny the browser's own connection to a host that
  `curl`/`WebFetch` reaches fine - they don't share a tunnel path through the proxy.** When a
  page needs one specific host's real, unstubbed asset, fetch it once with `curl`/`WebFetch` and
  serve it from disk via route interception; a fetch tool succeeding through the same proxy is
  not evidence the browser can reach that host too.

- **A committed pixel golden is only comparable under the exact build that rendered it.** Two
  browsers a version apart rasterise text and shadows differently, so a comparison across them
  measures the renderer, not the product. Where the output is compared pixel by pixel, read the
  installed driver version at launch and **refuse to run** on any other, naming the pinned one in
  the error; where it is not — a build artifact, a behavioural assertion — let the build float
  and spend nothing on pinning it.

- **Pinning is what buys a zero-diff browser golden — budget for the whole recipe or accept a
  tolerance.** A browser screenshot is not bit-stable across machines by default, which is why
  the general advice is a small tolerance. It *can* be made bit-stable, and the price is this
  pack's next two sections in full: the pinned build, a font jail, and the rasterisation flags.
  Take all of it or take the tolerance; a half-applied recipe gives a zero-diff gate that fails
  on someone else's machine for reasons no one can read off the diff.

## The page's world is an input — replace all of it

- **Serve the page from a fake origin you fulfil from disk, and abort anything you did not
  name.** Intercepting at the browser needs no server process, no port and no free-port race,
  and it reaches *every* request the page makes rather than the ones an application-level mock
  happens to know about. Make the default arm an abort: a new external dependency then breaks
  the run loudly instead of quietly adding real network to a run meant to be hermetic.

- **Route a vendored third-party asset host-agnostically.** A stylesheet you serve in place of a
  CDN copy still resolves *its own* relative URLs against the host it was served from, so the
  font or image files it references arrive addressed to that CDN. Match those follow-up requests
  on the path alone, on any host, or the sheet loads and every asset it names 404s — which
  renders as a silent fallback rather than an error.

- **Know which knobs are fixed at context creation and which are per page.** Locale, timezone,
  viewport, device scale factor, geolocation and permissions belong to the browser *context* and
  cannot be changed once it exists — so proving that a product reads a fixed zone rather than
  the device's takes **two** contexts, not one page reconfigured twice. The clock, seeded
  randomness and injected scripts are per page.

- **A command-line window-size flag is not a viewport — a narrow one does not test the narrow
  layout.** Ask a browser's *CLI* for a phone-sized window and it renders the page at a clamped
  width and crops the overflow, without applying the media queries the width should have
  triggered. The output looks exactly like a horizontal-overflow bug in every section of a page
  that has none, and the instinct is to go hunting through the CSS for the offender. Only a
  context or page created with an explicit viewport puts the page in that layout. Reserve the
  CLI screenshot for the width the window happens to be, and give it a virtual-time budget that
  outlasts the page's entrance animations, or sections capture mid-transition and read as broken
  when they are fine.

- **Install every fake as an init script, so it runs before the page's first script.** A stub
  installed after load has already lost every call made during boot. Seeded randomness, storage
  seeds, and any API you are replacing all belong there.

- **Freezing CSS animation does not freeze the Web Animations API.** Zeroing
  `animation-duration` and `transition-duration` stops declarative animation and nothing else;
  anything driven through `element.animate` keeps running, and a capture races it. Stub the
  method so every such animation resolves on its end state immediately.

- **Give the clock two modes and pick deliberately.** A fixed instant is right for a resting
  state. A requirement about what the *passage* of time changes needs the clock installed and
  paused instead, so the page's timers exist and can be wound forward on purpose — a fixed clock
  has no timers to advance.

## Fonts decide the layout, and the machine decides the fonts

- **Vendoring the web fonts is half the job — every glyph they lack is drawn from the machine.**
  An emoji, an arrow, a currency sign, a non-Latin title: each falls back to whatever the host
  has installed, so the rendering quietly becomes a record of that machine's font set. The
  failure is brutal and unobvious — one string measures wider on a runner than on a workstation,
  wraps, and every card below it moves down a line. Launch the browser with its own
  font-configuration world whose only font directory is one you vendored, with the generic
  families aliased into it, so nothing installed on the host can reach the page.

- **Ask the browser for reproducible rasterisation.** Disable hinting and subpixel text, force
  an sRGB colour profile, hide scrollbars, and disable GPU rasterisation. Shadows and blurs need
  two more: partial raster reuses tiles whose seams land inside a blur, and runtime-optimised
  drawing routines differ by CPU — both make the *same* page render differently run to run on
  one machine.

## Capturing

- **Clip at an element's box rather than screenshotting the element.** An element screenshot
  scrolls the element into view first, and a scroll dismisses whatever hover or focus opened the
  state you came to capture. A clip moves nothing. For the same reason, open hover-driven UI at
  capture time rather than in a preceding drive step, and settle the scroll position
  deliberately before measuring anything.

- **A bounding box is viewport-space and goes stale.** Drivers scroll an element into view
  before clicking it, so a rectangle measured before a click means somewhere else after one.
  Convert to document coordinates at the moment of measurement, then take the clip from a
  full-page shot so a region below the fold is still inside the rendered image.

- **Round a clip to whole pixels.** A layout rectangle is fractional; letting a fractional clip
  reach the screenshot leaves the rounding to the renderer, and half a pixel either way is a
  different image. Clamp it to the page's own bounds as well — a clip outside the rendered image
  is an error, not a crop.

- **Rendering a shipped page outside its runtime means removing the scripts that need that
  runtime.** They throw on the first missing global and populate nothing, so the capture is of
  an empty surface that looks like a product bug. Strip them after load and set the state you
  meant to show yourself.

- **Launch once and reuse the browser across captures.** Process startup dominates the cost of a
  capture, so a fresh browser per shot turns a fast run into a slow one for nothing; take a new
  context or page per capture instead, and close it, so no state leaks between them.
