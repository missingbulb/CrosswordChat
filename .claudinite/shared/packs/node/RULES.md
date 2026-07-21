# Node.js

Portable, project-agnostic practices for working in Node.js / npm codebases — package management, scripts, module resolution, runtime gotchas — true for any Node project read cold.

## jsdom diverges from a real browser in ways a green test can hide

A DOM faked with jsdom (the usual Node test-environment DOM) differs from Chrome in ways that let a passing test mask a broken production path — two that recur:

- **`body.innerText` is null in jsdom.** Code reading `el.innerText || el.textContent` therefore falls through to `textContent` under test, which *includes* `<script>` / `<style>` text, `<select>` / `<option>` text, and CSS-hidden text that a real browser's `innerText` omits. A visible-text scrape can pass against cached HTML yet find nothing (or the wrong thing) in Chrome; treat body-text results as jsdom-optimistic and don't add a test that only passes because of it.
- **`runScripts: "outside-only"` (the default) parses `<noscript>` into live DOM — the opposite of a real browser.** With scripting off, jsdom turns `<noscript>` content into real elements, so a `textContent` read looks clean under test but splices the `<noscript>` markup into the value in Chrome (which, scripting on, keeps `<noscript>` as raw text). Parse a script-free fragment with `runScripts: "dangerously"` to reproduce the browser.
