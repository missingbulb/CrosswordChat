# CrosswordChat

Solve the New York Times crossword **conversationally**: a Chrome extension that reads clues
aloud ("17 Across. Little house. The word 'house' is in italics. 6 letters."), listens to your
answer, checks it against the grid — homophones, lengths, crossing letters and all — types it in,
and moves on. Click the extension icon to start; click again to stop; solve the puzzle to hear
"Hooray."

## The three feasibility questions, answered

Full analysis in [`docs/FEASIBILITY.md`](docs/FEASIBILITY.md):

1. **Fully client-side?** Yes — no server, no API keys, nothing to deploy. One asterisk: Chrome's
   default speech recognition runs on Google's servers (part of the browser, not ours); recent
   Chrome can do it on-device. Enforced by an architecture test (no network primitives in source).
2. **Speech APIs available to extensions?** Yes, both directions: `webkitSpeechRecognition`
   (with an n-best list we exploit for homophones) and `chrome.tts`/`speechSynthesis`. They need
   a document context, which is why the conversation lives in the side panel.
3. **Can we type into the NYT grid?** Yes via simulated click+keydown per cell, verified by
   re-reading the DOM. One real risk (`isTrusted` filtering) with three documented fallbacks —
   validated early by manual test MT-02.

## Repository map

| Path | What it is |
|---|---|
| [`docs/REQUIREMENTS.md`](docs/REQUIREMENTS.md) | **Source of truth.** ~80 testable requirements with case analyses; every Active one is enforced to have a test (see below). |
| [`docs/FEASIBILITY.md`](docs/FEASIBILITY.md) | Client-side validation, speech API availability, grid-writing strategies + fallbacks. |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Module map, runtime topology, data contracts, decision log. |
| [`docs/MANUAL-TESTS.md`](docs/MANUAL-TESTS.md) | MT-01…MT-24: minutes-long scripts for everything a browser can't fake (live page, mic, audio). |
| `extension/src/page-adapter/` | The only code that knows the NYT DOM (read grid/clues, type answers, watch changes, self-diagnosing probe). |
| `extension/src/puzzle-model/` | Pure crossword semantics: numbering, crossings, patterns, full-vs-solved. |
| `extension/src/matching/` | Pure speech-to-answer matching: normalization, digits→words, homophone dictionary, length/collision verdicts, command lexicon. |
| `extension/src/conversation/` | Pure dialog policy: state machine, next-clue strategies, all English strings + clue verbalizer. |
| `extension/src/speech/` | TTS/STT wrappers over browser APIs, injectable for tests. |
| `extension/src/{app,background,content,sidepanel}/` | Wiring: orchestrator, icon toggle, message routing, captions UI. |
| `tests/fixtures/fake-nyt/` | A faithful miniature of the NYT crossword page (same classes, same keyboard model) — integration-test target and offline demo stage. |
| `tools/trace.mjs` | Requirements-coverage enforcer (`npm run trace`). |
| [`docs/RELEASING.md`](docs/RELEASING.md) | Versioning (current: **0.9.0**), CI workflows, release process, Chrome Web Store deployment setup. |
| `.github/workflows/` | Test (every push), Pack (installable zip artifact), Release (bump + tag + GitHub Release), Deploy to Chrome Web Store. |

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

## Try it

```bash
npm run build     # → dist/
```

Load `dist/` via `chrome://extensions` → Developer mode → **Load unpacked** (Chrome ≥ 116).
Open a NYT crossword (the free Mini works), click the CrosswordChat icon, allow the microphone,
and talk: an answer, `pass`, `repeat`, `hint`, `spell it`, `help`, `goodbye`.

No NYT subscription handy? Rehearse offline against the fake page:

```bash
npm run build:dev   # dev build that also matches localhost
npm run fixture     # serves the fake crossword at http://localhost:8787
```

## Status & next steps

Scaffolding with all pure logic implemented and tested offline. Before building further, run
**MT-01** (selector probe) and **MT-02** (injection spike) from
[`docs/MANUAL-TESTS.md`](docs/MANUAL-TESTS.md) on the live site — they validate the only real
unknowns (NYT's current markup and untrusted-event handling) in under five minutes.
