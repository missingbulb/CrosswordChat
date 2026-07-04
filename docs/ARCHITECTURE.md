# CrosswordChat — Architecture

One rule drives the layout: **each hard problem lives in its own folder, testable without the
others.** The NYT DOM, the crossword semantics, the dialog policy, the phonetics, and the speech
plumbing are five different problems; none imports another's internals.

## 1. Runtime topology (who runs where)

```
┌─────────────────────────── Chrome ───────────────────────────────┐
│                                                                  │
│  Service worker (background/)  "switchboard + mouth"             │
│  · icon click → start/stop the in-page session                   │
│  · one-session bookkeeping, badge                                │
│  · chrome.tts relay (speak/cancel) — content scripts can't       │
│         ▲                                                        │
│         │ port (session registration + speak/done/cancel)        │
│         ▼                                                        │
│  ┌──────────────────────────────────────────────┐                │
│  │ NYT crossword tab — content script           │                │
│  │  "brain + ears + hands", speech-only UI      │                │
│  │  · orchestrator (app/) · conversation machine│                │
│  │  · matching · STT port (mic, page origin)    │                │
│  │  · page-adapter (read/write/watch)           │                │
│  │  · console diagnostics (no visual UI)        │                │
│  │  main-world script (probe)                   │                │
│  └──────────────────────────────────────────────┘                │
└──────────────────────────────────────────────────────────────────┘
```

- **Why the brain is in the page (content script):** the product is deliberately speech-only — no
  panel or popup to host or babysit. Speech recognition needs a document; the page is one. The mic
  grant belongs to nytimes.com (prompted once, on first session), and the session's lifetime is the
  page's — reload/navigate ends it, which is the wanted behavior. See FEASIBILITY §2.
- **Why TTS stays in the service worker:** `chrome.tts` (immune to page autoplay rules) is not
  exposed to content scripts, so the session relays speak/cancel over its port.

## 2. Module map (source of truth for "what goes where")

```
extension/src/
  page-adapter/    NYT DOM in, NYT DOM out. The ONLY place 'xwd__' may appear (REQ-PAGE-011).
    selectors.js     every selector/class, one file, probe-checked
    reader.js        DOM → Snapshot (grid cells, clue runs, selection, solved signal)
    writer.js        enterAnswer/clearEntry via click + synthetic keydown, verified re-read
    navigator.js     selectClue (click the clue list item)
    watcher.js       MutationObserver → {solved | selection | grid} events (session-scoped)
    probe.js         selector health report for the live page
    clue-html.js     clue innerHTML → [{text, italic}] runs (pure; entities decoded)
  puzzle-model/    Crossword semantics. Pure.
    model.js         numbering, clue↔cells, crossings, patterns, progress, full-vs-solved
  matching/        Phonetics ↔ orthography. Pure.
    normalize.js     tokenize, digits/ordinals→words, A–Z normalization
    homophone-data.js  bundled dictionary (word sets + letter names + NATO)
    evaluate.js      utterance alternatives × entry → fit | ambiguous | collision | length-mismatch
    commands.js      command lexicon → intents (next/hint/answer …)
  conversation/    Dialog policy. Pure.
    machine.js       (state, event) → {state', actions[]}  — the "what to do next" algorithm
    strategies.js    next-clue selection: list-order, most-filled
    phrases.js       every English string; clue verbalizer (italics/brackets/?/blank/length)
  speech/          Browser speech plumbing. Injectable for tests.
    tts-port.js      chrome.tts | speechSynthesis → speak()/cancel() (used by the service worker)
    remote-tts-port.js  same contract from the content script: relays speak/cancel over the port
    stt-port.js      webkitSpeechRecognition → listenOnce() n-best, error taxonomy, mic preflight
  app/
    orchestrator.js  executes machine actions via ports/pageClient; owns the event loop
  background/
    service-worker.js  icon toggle, single-session bookkeeping, badge, chrome.tts relay
  content/
    content-script.js  hosts the session: orchestrator + STT + page-adapter, console diagnostics;
                       inert until asked (REQ-NFR-004)
    main-world.js      optional in-page probe helper (window.gameData presence)
  shared/
    messages.js      message type constants shared by content/background
```

**Dependency direction (enforced by review + arch test):**
`page-adapter` and `speech` touch browsers; `puzzle-model`, `matching`, `conversation` are pure and
import nothing from the impure layers. `app/orchestrator` is the only place all of them meet.

## 3. Data contracts

### Snapshot (page-adapter → everyone; the only puzzle input)
```js
{
  status: 'active' | 'solved' | 'not-found',
  size: { rows, cols },
  cells: [{ index, row, col, block, letter /* '' if empty */, number /* or null */ }],
  clues: [{ id: 'A1', number: 1, direction: 'across', runs: [{ text, italic }] }],
  selection: { clueId: 'A1' | null, cellIndex: number | null }
}
```
Cell indices are row-major DOM order. Clue `runs` preserve formatting for the verbalizer.
`cellIndices` per clue are *derived* in the model (numbering algorithm), then cross-checked against
DOM numbers (REQ-MODEL-001) — the page adapter stays dumb.

### Machine events (into `machine.reduce`)
`START{snapshot}` · `TTS_DONE` · `HEARD{alternatives:[{transcript,confidence}]}` · `BARGE_IN` ·
`STT_ERROR{code}` · `ENTRY_RESULT{ok,snapshot}` · `UNDO_RESULT{ok,snapshot}` ·
`PAGE_EVENT{kind,snapshot}` · `TOGGLE_OFF`

### Machine actions (out of `machine.reduce`)
`SAY{say:{kind,...}}` · `LISTEN` · `ENTER{clueId,word}` · `UNDO{clueId,cells}` ·
`SELECT_CLUE{clueId}` · `END`

The machine is a **pure reducer**: same state + event → same actions, every time. That makes the
entire dialog policy (the trickiest behavior in the product) unit-testable as data — every
lifecycle requirement in REQUIREMENTS §5–§11 is asserted against action traces, no browser needed.
`SAY` payloads are *semantic* (`{kind:'collision', collisions:[...]}`); `phrases.js` turns them
into English at the edge. Policy tests don't break when wording changes; wording tests live with
the verbalizer.

## 4. The main loop (orchestrator)

```
dispatch(event):
  {state, actions} = machine.reduce(state, event)
  for a of actions:
    SAY         → console line + tts.speak(phrases.render(a.say)) → dispatch(TTS_DONE)
                  (a barge-in mic runs alongside the speech — REQ-SPCH-009: echo-guarded
                   input cancels the utterance and dispatches HEARD when the utterance
                   ends in listening; otherwise only stop is honored → BARGE_IN)
    LISTEN      → stt.listenOnce() → dispatch(HEARD | STT_ERROR)
    ENTER       → pause watcher → pageClient.enterAnswer(...) → dispatch(ENTRY_RESULT)
    UNDO        → pause watcher → clearEntry(blank-before cells) + enterAnswer(overwritten
                   letters) → dispatch(UNDO_RESULT) — reverts the last entry (REQ-ANS-017)
    SELECT_CLUE → pageClient.selectClue(...)
    END         → teardown (cancel tts/stt, stop watcher, disconnect port)
```
Strictly sequential; no queues, no races. Watcher events are suppressed while we write (our own
typing must not look like user activity — REQ-NAV-008's echo-loop clause).

## 5. Message protocol (content ⇄ background)

Page operations need no messages anymore — the orchestrator calls the page adapter directly
(same document). What's left is session control and the TTS relay:

- Background → content (via `chrome.tabs.sendMessage`): `{type:'cc:start'}` — begin a session.
  Debug-only, from the service-worker console: `{type:'cc:ping'}` · `{type:'cc:snapshot'}` →
  Snapshot · `{type:'cc:probe'}` → report (MT-01).
- Content ⇄ background (long-lived Port `cc-session`): connect = session registered (badge ON);
  `{type:'cc:speak', id, text}` → `chrome.tts` → `{type:'cc:speak-done', id}` ·
  `{type:'cc:tts-cancel'}` — immediate silence · `{type:'cc:close'}` (background → content: icon
  toggle / takeover) · disconnect = session over (badge cleared, in-flight speech cancelled).

## 6. Testing architecture (the executable-requirements machinery)

| Layer | Harness | What it proves |
|---|---|---|
| `matching`, `puzzle-model`, `conversation` | vitest, pure node | REQ-ANS/MODEL/NAV/CMD/HINT/READ/LIFE policy — the bulk of the spec |
| `speech` ports | vitest + hand-rolled fake `SpeechRecognition`/`chrome.tts` | REQ-SPCH wrapper behavior, error taxonomy |
| `page-adapter` | vitest + jsdom against **`tests/fixtures/fake-nyt/`** — a faithful replica of the NYT crossword DOM (same classes, same keyboard behavior, congrats modal) | REQ-PAGE end to end without nytimes.com |
| Architecture rules | `tests/unit/arch.test.js` greps the tree | REQ-PAGE-011, REQ-NFR-001/002 |
| Live page, mic, audio | `docs/MANUAL-TESTS.md` scripts MT-01… | everything a browser can't fake honestly |
| Traceability | `tools/trace.mjs` (`npm run trace`) | every Active REQ ↔ some test; no phantom IDs (REQ-NFR-006) |

The fake page double-dips: it is the integration-test target **and** a local rehearsal stage —
`npm run fixture` serves it at `http://localhost:8787`, and `npm run build:dev` produces a build
whose content script also matches localhost, so the whole voice loop can be exercised without an
NYT subscription.

## 7. Decisions log

| # | Decision | Why | Revisit when |
|---|---|---|---|
| D1 | MV3 + the content script hosts the conversation, speech-only (rev. 2 — originally the side panel) | Speech recognition needs a document and the page is one; no UI wanted (captions dropped for console diagnostics); session dying with the page is desired | Offscreen document if page-lifetime coupling or the nytimes.com mic grant annoys |
| D2 | `chrome.tts` primary for output | Immune to page autoplay rules | speechSynthesis-only if voice quality disappoints |
| D3 | Synthetic click+keydown for writing | Matches user behavior; per-cell addressing beats cursor settings | MT-02 fails → fallbacks in FEASIBILITY §3 |
| D4 | Pure reducer for dialog policy | The spec is mostly dialog policy; reducers make it assertable | — |
| D5 | Semantic SAY payloads, English at the edge | Policy tests survive copy edits | i18n (REQ-NFR-005) |
| D6 | Plain ES modules + esbuild, no TS | Zero-config bundling for MV3; JSDoc where shapes matter | Team growth |
| D7 | Homophones via bundled dictionary + n-best STT | Client-side (REQ-NFR-001); alternatives catch what the dictionary misses | Dictionary gaps observed in MT-06 |
| D8 | Numbering derived, DOM cross-checked | Survives NYT markup drift; catches reader bugs | — |
