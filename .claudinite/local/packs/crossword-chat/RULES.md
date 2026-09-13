# CrosswordChat — the repo's own instances

The judgment is canon's (`host-page`, `web-speech`, both declared here). What follows is only
what is true of this repo and this host: where the quarantine wall runs, what nytimes.com was
measured doing, and which files carry the evidence.

- **Reaching the host's DOM** — do it only from `extension/src/page-adapter/`, behind a
  `Snapshot` in and `enterAnswer` out (REQ-PAGE-011); `extension-test/unit/arch.test.js` fails if
  the `xwd__` prefix appears outside it, and that wall is why `puzzle-model/`, `matching/` and
  `conversation/` are testable with no browser. Inside it, selectors change in `selectors.js`
  and nowhere else.

- **Editing `page-adapter/selectors.js`** — keep recording the dated **negative** findings that
  make up most of its value: the state classes sit on the `<rect>` and not the `<g>`, the pencil
  button exposes no `aria-pressed` and no class change, and the letter/number `<text>` nodes
  carry no distinguishing class.

- **Hearing that the extension stopped working** — run `page-adapter/probe.js` (REQ-PAGE-009)
  from the in-page menu (MT-01) first; it turns the report into "the clue-list wrapper selector
  matches 0, want 2".

- **Writing into the grid** — click each cell and type one letter, which is immune to the host's
  advance-on-type and skip-filled settings, then poll the DOM back to confirm (REQ-PAGE-007).
  The keystroke fidelity that makes those events land is `page-adapter/writer.js`'s
  `keyEventInit`/`typeKey`, verified live in MT-02.

- **Borrowing pencil mode for a write** — restore it afterwards (REQ-PAGE-012); the write's
  pencil-mode fallback is REQ-ANS-019.

- **Keeping a voice session alive on nytimes.com** — the host auto-pauses a quiet puzzle after
  ~30 s of no keyboard input and a voice solver touches no keyboard, so the adapter sends a bare
  `Shift` keydown/keyup on every heard command (REQ-LIFE-017), driven by real user activity and
  never by a timer of ours.

- **Diffing the grid for changes** — check for the pause veil before diffing
  (`page-adapter/watcher.js`): it empties the visible entries, which reads as the user having
  cleared everything.

- **Speaking from the content script** — `chrome.tts` is not exposed there, so relay it over the
  `cc-session` port: `speech/remote-tts-port.js` presents the same contract as
  `speech/tts-port.js`, so the orchestrator cannot tell the difference.

- **Guarding against hearing our own TTS as a transcript** — the echo the relay's OS-rendered
  audio leaves behind is the string-match guard's, REQ-SPCH-005.

- **Rehearsing the read/write/watch cycle** — drive `extension-test/fixtures/fake-nyt/`
  (`npm run fixture`), and `npm run build:dev` to widen the matches to `localhost:8787` (MT-23);
  `dev/docs/MANUAL-TESTS.md` is the manual-test document.

- **Adding anything at load time** — there is exactly one carve-out, mounting the toolbar button
  (REQ-LIFE-012); nothing else runs between sessions (REQ-NFR-004).
