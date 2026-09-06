# CrosswordChat — the repo's own instances

The general rules for guesting in a host page and for driving the browser's speech surfaces are
canon (`host-page`, `web-speech`, both declared here). This file holds only what is true of
*this* repo and this host: where the quarantine wall runs, what nytimes.com was measured doing,
and which files and requirement ids carry the evidence.

- **Reaching the host's DOM** — every selector, class string and structural assumption belongs in
  `extension/src/page-adapter/`, behind a `Snapshot` in and `enterAnswer` out (REQ-PAGE-011,
  `dev/docs/ARCHITECTURE.md` §2); the crossword model, the dialog policy and the matcher never
  learn the page exists, which is why `puzzle-model/`, `matching/` and `conversation/` are
  testable with no browser. The wall is enforced by token: `extension-test/unit/arch.test.js`
  fails if the host's class prefix `xwd__` appears in code outside `page-adapter/`. Inside the
  quarantine, selectors change in `page-adapter/selectors.js` and nowhere else.

- **Editing `page-adapter/selectors.js`** — it carries its own dated provenance, and the
  **negative** findings are the expensive part: the state classes sit on the `<rect>` and not the
  `<g>`, the pencil button exposes no `aria-pressed` and no class change, the letter/number
  `<text>` nodes carry no distinguishing classes so the class-based selectors match nothing live.
  Keep recording them there.

- **Answering "it stopped working"** — run `page-adapter/probe.js` (REQ-PAGE-009) from the in-page
  menu (MT-01) before anything else; it reports a row per selector against the live page.

- **Writing into the grid** — click each cell and type one letter (immune to the host's
  advance-on-type and skip-filled settings), then poll the DOM back to confirm (REQ-PAGE-007).
  The dispatch fidelity that makes those keystrokes land at all — the legacy `keyCode`/`which`
  fields, the full keydown → keypress → keyup — is `page-adapter/writer.js`'s `keyEventInit` /
  `typeKey`, verified live in MT-02.

- **Borrowing pencil mode** — set it to match the write and put it back (REQ-PAGE-012). Its ON
  state is unreadable on the live button, so click parity is the normal path and the pencil
  softening degrades rather than failing the write (REQ-ANS-019).

- **Keeping a voice session alive** — nytimes.com auto-pauses a quiet puzzle after ~30 s of no
  keyboard input, and a voice solver touches no keyboard, so the adapter sends a bare `Shift`
  keydown/keyup on every heard command (REQ-LIFE-017) — driven by real user activity, never by a
  timer of ours. The pause veil empties the visible entries, so `page-adapter/watcher.js` checks
  for it before diffing.

- **Speaking from the page** — the session lives in the content script (recognition needs a
  document, and the mic grant belongs to nytimes.com) and `chrome.tts` is not exposed there, so
  speech is relayed over the long-lived `cc-session` port: `speech/remote-tts-port.js` presents
  the same contract as `speech/tts-port.js` so the orchestrator cannot tell the difference. The
  echo the relay's OS-rendered audio leaves behind is handled by the string-match echo guard
  (REQ-SPCH-005), and the missed-endpoint pause window is 1.8 s — measured here: 1.2 s cut real
  commands off solvers who paused to think mid-instruction.

- **Testing the read/write/watch cycle** — drive `extension-test/fixtures/fake-nyt/`
  (`npm run fixture`), which mirrors `selectors.js` exactly; `npm run build:dev` widens the
  matches to `localhost:8787` so the whole voice loop is rehearsable without a subscription
  (MT-23). The fixture only ever shows markup we already knew about, so what only the real host
  can answer lives in `dev/docs/MANUAL-TESTS.md`, and every live finding is a fixture update.

- **Loading on nytimes.com at all** — the one load-time page change is mounting the toolbar
  button (REQ-LIFE-012); nothing else runs between sessions (REQ-NFR-004).
