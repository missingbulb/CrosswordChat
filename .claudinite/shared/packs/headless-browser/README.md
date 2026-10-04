# headless-browser pack

Suggested when a near-root `package.json`, `requirements*.txt` or `pyproject.toml` declares a
browser-automation driver: `@playwright/test`, `playwright`, `playwright-core`, `puppeteer`,
`puppeteer-core` or `pyppeteer`.

Prose and three checks over the repo's JS/TS sources; declaring it is the project's call.

## Rules (`RULES.md`)

| Rule | Severity | Reason | Enforcement |
|---|---|---|---|
| Resolve binary, never download | high | correctness | prose: <200 words |
| Reinstalling the driver repeats the download danger | high | correctness | prose: <200 words |
| Stub an unvendored CDN library's API | medium | correctness | prose: <200 words |
| Browser egress differs from `curl` | medium | correctness | prose: <100 words |
| Pin the build for pixels | high | correctness | prose: <100 words |
| Zero-diff costs whole recipe | medium | correctness | prose: <100 words |
| Fake origin, abort by default | high | correctness | prose: <100 words |
| Route vendored assets host-agnostically | medium | correctness | prose: <100 words |
| Context knobs vs page knobs | medium | correctness | prose: <100 words |
| Window-size flag isn't a viewport | high | correctness | prose: <200 words |
| Fakes as init scripts | high | correctness | prose: <50 words |
| CSS freeze misses `element.animate` | high | correctness | prose: <50 words |
| Two clock modes | medium | correctness | prose: <100 words |
| Font jail, not just webfonts | high | correctness | prose: <200 words |
| Reproducible rasterisation flags | high | correctness | prose: <100 words |
| Clip, don't screenshot the element | medium | correctness | prose: <100 words |
| Bounding boxes go stale | medium | correctness | prose: <100 words |
| Whole-pixel clips | medium | correctness | prose: <100 words |
| Strip scripts needing the runtime | medium | correctness | prose: <100 words |
| One browser, many contexts | medium | performance | prose: <100 words |

## Checks

| Check | Severity | Reason | Enforcement |
|---|---|---|---|
| `headless-browser/networkidle-wait` | high | correctness | check: blocking |
| `headless-browser/capture-without-font-wait` | high | correctness | check: advisory |
| `headless-browser/insecure-fake-origin` | medium | correctness | check: blocking |

All three read the repo's JS/TS sources with comments blanked, skipping the usual vendored and
build directories. `headless-browser/networkidle-wait` flags any `networkidle` spelling, in a
`waitUntil` option or a load-state wait. `headless-browser/capture-without-font-wait` applies only
where reference images are tracked (`__screenshots__/`, `goldens/`, `snapshots/`, `*.golden.png`)
and flags each file taking a screenshot when nothing in the repo mentions `document.fonts`, so the
wait may live in a shared helper. `headless-browser/insecure-fake-origin` applies to a file that
intercepts with `.route(` and flags an `http://` literal there unless it addresses loopback, is the
route pattern itself, or sits in an `href`/`src`/`action` attribute of fulfilled markup.

## Boundary

This pack is the browser itself. Which engine a UI golden should use, the tolerance it may carry,
self-skipping where no browser is present, the re-baselining approval gate, and wiring the run into
a workflow are all deliberately not here.
