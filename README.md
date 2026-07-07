# CrosswordChat

Solve the New York Times crossword **conversationally**: a Chrome extension that reads clues
aloud ("17 Across. Little house. The word 'house' is in italics. 6 letters."), listens to your
answer, checks it against the grid — homophones, lengths, crossing letters and all — types it in,
and moves on. Click the speech-bubble button next to the pencil in the puzzle toolbar (or the
extension icon) to start; click again to stop; solve the puzzle to hear "Hooray."

## The three feasibility questions, answered

Full analysis in [`docs/FEASIBILITY.md`](docs/FEASIBILITY.md):

1. **Fully client-side?** Yes — no server, no API keys, nothing to deploy. One asterisk: Chrome's
   default speech recognition runs on Google's servers (part of the browser, not ours); recent
   Chrome can do it on-device. Enforced by an architecture test (no network primitives in source).
2. **Speech APIs available to extensions?** Yes, both directions: `webkitSpeechRecognition`
   (with an n-best list we exploit for homophones) and `chrome.tts`/`speechSynthesis`. Recognition
   needs a document context, which is why the conversation lives in the puzzle page itself
   (content script) — the extension is speech-only, its one visual control being the start/stop
   button it places in the puzzle toolbar. Speaking goes through the service worker's
   `chrome.tts`.
3. **Can we type into the NYT grid?** Yes via simulated click+keydown per cell, verified by
   re-reading the DOM. One real risk (`isTrusted` filtering) with three documented fallbacks —
   validated early by manual test MT-02.

## Repository map

| Path | What it is |
|---|---|
| [`docs/REQUIREMENTS.md`](docs/REQUIREMENTS.md) | **Source of truth.** ~80 testable requirements with case analyses; every Active one is enforced to have a test (see below). |
| [`docs/FEASIBILITY.md`](docs/FEASIBILITY.md) | Client-side validation, speech API availability, grid-writing strategies + fallbacks. |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Module map, runtime topology, data contracts, decision log. |
| [`docs/MANUAL-TESTS.md`](docs/MANUAL-TESTS.md) | MT-01…MT-31: minutes-long scripts for everything a browser can't fake (live page, mic, audio). |
| `extension/src/page-adapter/` | The only code that knows the NYT DOM (read grid/clues, type answers, watch changes, self-diagnosing probe). |
| `extension/src/puzzle-model/` | Pure crossword semantics: numbering, crossings, patterns, full-vs-solved. |
| `extension/src/matching/` | Pure speech-to-answer matching: normalization, digits→words, homophone dictionary, length/collision verdicts, command lexicon. |
| `extension/src/conversation/` | Pure dialog policy: state machine, next-clue strategies, all English strings + clue verbalizer. |
| `extension/src/speech/` | TTS/STT wrappers over browser APIs, injectable for tests. |
| `extension/src/{app,background,content}/` | Wiring: orchestrator, icon toggle, in-page session host, TTS relay. |
| `tests/fixtures/fake-nyt/` | A faithful miniature of the NYT crossword page (same classes, same keyboard model) — integration-test target and offline demo stage. |
| `tools/trace.mjs` | Requirements-coverage enforcer (`npm run trace`). |
| [`dev/build/release/store_artifacts/`](dev/build/release/store_artifacts) | Chrome Web Store assets: [`PRIVACY.md`](dev/build/release/store_artifacts/PRIVACY.md) (the public privacy policy, published at [missingbulb.github.io/CrosswordChat/privacy/](https://missingbulb.github.io/CrosswordChat/privacy/)), screenshots and promo tiles (regenerate: `node tools/make-store-assets.mjs`). |
| `.github/workflows/` | Test (every push) + the standard release set: Release: Create Package, Release: Publish to Chrome Web Store, Release: Daily Auto-Release, the privacy-page deploy, and the failure reporter. |

## Executable requirements — how verification works

Every requirement has an ID (`REQ-ANS-008`). Tests carry the IDs of the requirements they prove;
manual tests declare `Covers:` lines. The trace tool fails the build if an Active requirement has
no coverage or if anything references a phantom ID.

```bash
npm install
npm test          # 100+ automated assertions, REQ IDs in every title
npm run trace     # requirement ↔ test coverage matrix (fails on gaps)
npm run verify    # both
```

## Install

**[Install from the Chrome Web Store →](https://chromewebstore.google.com/detail/crosswordchat/ejhdleiiadnblaenljmpgfpgmhbfcgec)**

Or load the latest development build:

1. Download [the latest release zip](https://github.com/missingbulb/CrosswordChat/releases/latest/download/crossword-chat.zip)
   and extract it — it unpacks to a folder with `manifest.json` at its top. (Or build it
   yourself: `npm run build` → `dist/`, loadable directly.)
2. Open `chrome://extensions`, enable **Developer mode** (top right), click
   **Load unpacked**, and select that folder (Chrome ≥ 116).

Open a NYT crossword (the free Mini works), click the CrosswordChat icon, allow the microphone,
and talk: an answer, `pass`, `repeat`, `hint`, `spell`, `help`, `goodbye`.

No NYT subscription handy? Rehearse offline against the fake page:

```bash
npm run build:dev   # dev build that also matches localhost
npm run fixture     # serves the fake crossword at http://localhost:8787
```

## Releasing

The version users see is [`extension/manifest.json`](extension/manifest.json)'s `version`.
Merging a version bump to `main` cuts GitHub Release `vX.Y.Z` with `crossword-chat.zip`
attached, and the daily auto-release ships shipped-file changes to the Chrome Web Store on its
own (patch-bumping as needed).

## Status & next steps

Scaffolding with all pure logic implemented and tested offline. Before building further, run
**MT-01** (selector probe) and **MT-02** (injection spike) from
[`docs/MANUAL-TESTS.md`](docs/MANUAL-TESTS.md) on the live site — they validate the only real
unknowns (NYT's current markup and untrusted-event handling) in under five minutes.
