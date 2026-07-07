# CrosswordChat — Feasibility Analysis

This document answers the three feasibility questions raised in the project brief, with the
concrete API/mechanism choices the scaffolding is built on.

## 1. Can this run fully client-side (no server of ours)? — **Yes.**

Validated component by component:

| Component | Mechanism | Server needed? |
|---|---|---|
| Reading the puzzle (grid, clues, selection, solved state) | DOM of the already-loaded NYT page, via a content script | No. The user's browser already has the puzzle; we never call NYT APIs and inherit their login/subscription for free. |
| Understanding the puzzle (numbering, crossings, patterns) | Pure JS (`puzzle-model/`) | No |
| Homophone matching | Bundled dictionary (~90 curated sets) + pure JS | No |
| Conversation policy | Pure JS state machine | No |
| Text-to-speech | `chrome.tts` / `speechSynthesis` — voices are local (OS/browser voices) | No |
| Speech-to-text | Web Speech API | **No server of ours** — but see the asterisk below |
| Entering answers | Synthetic DOM events from the content script | No |

**The one asterisk — speech recognition backend.** Chrome's classic `webkitSpeechRecognition`
implementation streams audio to *Google's* speech service (not a server we run or pay for — it's
part of the browser, but audio does leave the machine). Recent Chrome (139+, Aug 2025) added
**on-device recognition** (`SpeechRecognition.available()` / `processLocally: true`) for `en-US`
on capable hardware. Our STT wrapper feature-detects this and can prefer local processing
(REQ-FUT-006). Either way: **no first-party server, no API keys, no accounts, nothing to deploy.**
This is enforced mechanically — `extension-test/unit/arch.test.js` fails if any `fetch`/`XHR`/`WebSocket`
appears in extension source (REQ-NFR-001), and MT-15 audits the network tab live.

Conclusion: the assumption in the brief is **correct**. The extension is a pure client.

## 2. Are speech APIs available to a Chrome extension? — **Yes, both directions.**

### Text-to-speech (2 options, both available)
- **`chrome.tts`** — extension-only API (`"tts"` permission). Works from extension pages and the
  service worker, unaffected by web-page autoplay/user-gesture policies. **Primary choice.**
- **`speechSynthesis`** (Web Speech API) — available in any document context (content script,
  side panel). Subject to autoplay/user-activation rules on ordinary pages, which is why it's the
  fallback, not the primary.
- Neither supports SSML in practice, so question intonation can't be *forced*; we keep the
  trailing `?` (voices often inflect naturally) **and** speak the words "question mark"
  (REQ-READ-004 / REQ-SPCH-006) — exactly the fallback behavior the brief asked for.

### Speech-to-text (available, with three practical caveats)
- **`webkitSpeechRecognition`** (Web Speech API) is available in *document* contexts: content
  scripts, side panel, popup, offscreen documents. It is **not** available in the MV3 service
  worker — which is fine, because our conversation runs in the content script (the puzzle page is
  a document).
- It returns an **n-best list** (`maxAlternatives`), which we exploit for homophone handling
  (REQ-ANS-004) — a genuine bonus for this use case.
- Caveats and how the design absorbs them:
  1. **Mic permission context.** Permission is granted per-origin. Recognition runs in the content
     script, so the grant belongs to **nytimes.com** — the prompt reads as the site asking, and the
     grant persists across NYT visits. Accepted deliberately (rev. 2): it buys a zero-UI product.
     The STT port pre-flights `navigator.permissions.query({name:'microphone'})` + a one-time
     `getUserMedia` to surface the prompt cleanly (REQ-SPCH-003, MT-05).
  2. **No recognition in service workers.** Solved by architecture: recognition lives in the page;
     TTS lives in the service worker (`chrome.tts`, relayed over the session port).
  3. **Cloud vs on-device** — see §1's asterisk.

### Why the conversation runs **in the page** (content script) — rev. 2; originally the side panel
- The product is speech-only by decision: no captions, no panel, no visual surface (diagnostics go
  to the page console, REQ-SPCH-007/008). That removes the side panel's main reason to exist.
- A content script is a document, so recognition works; the mic prompt coming from nytimes.com and
  the session dying on page reload/navigation are both accepted — the latter is even wanted
  (REQ-LIFE-008 for free).
- TTS is *not* hosted in the page: `speechSynthesis` there is subject to nytimes.com's
  autoplay/user-activation rules, so speaking is relayed to the service worker's `chrome.tts`
  (immune to page policies) over the session port.
- A popup would close on any click into the page (killing the mic); the side panel worked but was
  a permanent visual appendage the product doesn't need.
- The extension icon still toggles the whole session (click = start, click again = stop),
  matching the brief's interaction model (REQ-LIFE-001/002).

## 3. Can we type answers into the NYT grid? — **Yes, with one risk to validate early.**

What the page gives us:

- **Reading state** is straightforward: the grid is an SVG (`g.xwd__cell` cells with letter/number
  text), the clue lists are `<ol>`s with rich-text `<li>`s, selection is expressed via CSS classes,
  and solving triggers a congratulations modal. All selectors are quarantined in
  `page-adapter/selectors.js` with an on-demand **probe** (REQ-PAGE-009, run per MT-01) because
  NYT can rename classes any day.
- **Writing** (primary approach): do what the user's fingers do —
  1. click the target cell (selects it),
  2. dispatch a `keydown` KeyboardEvent with the letter (NYT listens at document level),
  3. repeat per letter; then **re-read the cells to verify** (REQ-PAGE-007) and report honestly
     (REQ-ANS-013).
  Per-cell addressing sidesteps NYT's cursor-skip settings.
  Live-page hardening (post-MT-02): synthetic key events carry the legacy
  `keyCode`/`which`/`charCode` fields (bare `{key}` events construct them as 0, which
  keyCode-reading handlers ignore), a short settle delay separates the selection click from the
  keystroke, and verification **polls** the grid for up to ~1.5 s instead of reading it
  synchronously — the live app is a React page and repaints after our dispatch returns.
- **The risk:** synthetic events from a content script have `isTrusted:false`. Community solvers
  have driven the NYT grid with synthetic keyboard events successfully, but NYT could start
  filtering. This is why MT-02 (live injection spike) is ordered as the **second** manual test —
  validate before building further.
- **Fallbacks if NYT filters untrusted events** (in order):
  1. Dispatch from the **main world** (`chrome.scripting.executeScript({world:'MAIN'})` /
     main-world content script) directly at the app's own listeners — beats naive
     `isTrusted`-adjacent checks that inspect event provenance indirectly.
  2. Drive NYT's own React handlers via the clue-list/keyboard UI (their virtual keyboard buttons
     on mobile layout are plain buttons — clickable).
  3. **`chrome.debugger` + `Input.dispatchKeyEvent`** — produces fully trusted events. Guaranteed
     to work, at the cost of Chrome's "is being debugged" infobar. Acceptable last resort for a
     personal assistive tool.
- The write path is abstracted behind `pageAdapter.enterAnswer()` so swapping strategies never
  touches conversation logic.

## 4. Verdict

| Brief assumption | Verdict |
|---|---|
| "Can run fully on the client side" | **Confirmed** (one documented asterisk: Google-hosted recognition unless on-device is available) |
| "There are speech-to-text and text-to-speech APIs usable from an extension" | **Confirmed** (`webkitSpeechRecognition` + `chrome.tts`/`speechSynthesis`; service-worker limitation designed around) |
| "There'll be a way to input answers into the crossword" | **Feasible, primary approach implemented; must be validated on the live page early (MT-02); three fallbacks documented** |

## 5. Sequencing consequence

Because §3 carries the only real unknown, the manual test plan front-loads it:
**MT-01 (selector probe)** and **MT-02 (injection spike)** are designed to be run on a live NYT
page in under five minutes, before investing in polish. Everything else in the system is testable
offline against the faithful fake page (`extension-test/fixtures/fake-nyt/`).
