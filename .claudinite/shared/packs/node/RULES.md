# Node.js

Portable, project-agnostic practices for working in Node.js / npm codebases — package management, scripts, module resolution, runtime gotchas — true for any Node project read cold.

## jsdom diverges from a real browser in ways a green test can hide

Two that recur:

- **`body.innerText` is null in jsdom.** Code reading `el.innerText || el.textContent` therefore falls through to `textContent` under test, which *includes* the `<script>` / `<style>` text, `<select>` / `<option>` text, and CSS-hidden text a real browser's `innerText` omits. Treat body-text results as jsdom-optimistic; never add a test that only passes because of it.
- **`runScripts: "outside-only"` (the default) parses `<noscript>` into live DOM — the opposite of a real browser.** A `textContent` read looks clean under test but splices the `<noscript>` markup into the value in Chrome, which keeps `<noscript>` as raw text. Parse a script-free fragment with `runScripts: "dangerously"` to reproduce the browser.
