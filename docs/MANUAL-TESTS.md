# CrosswordChat — Manual Test Playbook

Scripts for everything an automated test can't honestly prove: the live NYT page, the microphone,
and actual audio. Each item is minutes long with a binary PASS/FAIL. The `Covers:` lines are
machine-read by `npm run trace` (see REQUIREMENTS §14) — keep them accurate.

**Setup for all tests:** `npm run build`, then load `dist/` via `chrome://extensions` → Developer
mode → *Load unpacked*. For live tests, be logged in to nytimes.com; the free **Mini**
(nytimes.com/crosswords/game/mini) works for everything except long-grid cases.
For offline tests, `npm run build:dev` + `npm run fixture` and open `http://localhost:8787`.

> **Run order matters for de-risking:** MT-01 and MT-02 validate the only real technical unknowns
> (live DOM selectors, synthetic keyboard input). Run them before anything else after any NYT
> redesign — and before building new features. See FEASIBILITY §5.

---

### MT-01 — Selector probe on the live page
Covers: REQ-PAGE-001 REQ-PAGE-002 REQ-PAGE-003 REQ-PAGE-004 REQ-PAGE-009 REQ-MODEL-001
1. Open today's Mini. Click the extension icon → side panel opens.
2. Click **Probe page** in the panel.
3. **PASS:** every probe row shows ✅ (board, cells, letters, numbers, both clue lists, clue text,
   selection, no congrats modal); reported grid size matches the visible grid; the number of
   across/down clues matches the printed lists. Any ❌ row = FAIL → fix `selectors.js` first.

### MT-02 — Answer injection spike (the go/no-go test)
Covers: REQ-PAGE-005 REQ-PAGE-006 REQ-PAGE-007 REQ-PAGE-008 REQ-ANS-013
1. On the Mini with an empty grid, start a session; answer the first clue with a correct word.
2. Watch the grid while the extension enters it.
3. **PASS:** letters appear in the correct cells; the panel reports success; saying a *wrong-but-
   fitting* word later also lands (letters visible), and the clue highlight follows the
   conversation. If letters do NOT appear: the panel must say entering failed (that part passing
   = REQ-ANS-013 PASS) — then escalate to the fallbacks in FEASIBILITY §3.

### MT-03 — Session start reads the highlighted clue
Covers: REQ-LIFE-001 REQ-LIFE-007 REQ-LIFE-010 REQ-READ-001 REQ-SPCH-001
1. On a fresh puzzle, click clue **3 Down** in the page's clue list.
2. Click the extension icon.
3. **PASS:** within ~1.5 s you hear at most a couple of greeting words, then "3 Down." + the clue
   text + "N letters." — and the mic indicator turns on. No tutorial monologue.

### MT-04 — Icon click kills the session instantly
Covers: REQ-LIFE-002
1. Start a session; while the clue is mid-readout, click the extension icon again.
2. **PASS:** audio stops mid-word (≤ ~0.5 s), panel closes, mic indicator gone.

### MT-05 — Microphone permission denied
Covers: REQ-SPCH-003
1. chrome://settings/content/microphone → Block for the extension (or reset and click "Block" on
   the prompt). Start a session.
2. **PASS:** after the first readout, the extension says (voice + caption) that the mic is blocked
   and how to fix it, then ends the session. No prompt loops, no silent hang.

### MT-06 — Conversational solve, end to end
Covers: REQ-ANS-006 REQ-LIFE-005 REQ-NAV-001 REQ-NAV-002 REQ-NAV-003 REQ-NAV-007 REQ-SPCH-002 REQ-SPCH-005 REQ-CMD-001
1. Solve today's Mini entirely by voice: answer, *pass* on unknowns, come back around.
2. **PASS:** fitting answers are confirmed ("It fits") and appear in the grid; *pass* leaves cells
   untouched and reads the next unfilled clue in list order (wrapping); the page highlight always
   matches the spoken clue; the mic never listens while the extension is talking; completing the
   puzzle triggers NYT's congratulations AND the extension's "Hooray" + session end.

### MT-07 — Collision, override, and replace
Covers: REQ-ANS-008 REQ-ANS-012 REQ-ANS-016
1. Fill a crossing letter manually so your next voice answer conflicts (e.g. grid has A where your
   word needs I). Give that answer.
2. **PASS:** the extension names the position, your letter, the existing letter (and the crossing
   clue), and does NOT enter. Say "enter it anyway" → now it enters, replacing the letter. Then
   answer a *different* fitting word on an already-full entry → it asks before replacing; "no"
   keeps the grid unchanged.

### MT-08 — Already-solved puzzle
Covers: REQ-LIFE-004
1. Open a puzzle you've already solved. Click the icon.
2. **PASS:** one cheerful "already solved" line, session ends by itself, mic never turns on.

### MT-09 — Grid full but wrong
Covers: REQ-LIFE-006
1. Fill the last empty entry with a wrong-but-fitting word (by voice or keyboard while in session).
2. **PASS:** the extension says the grid is full but something's off, does NOT celebrate, and keeps
   listening so you can navigate ("next", "hint") and replace entries.

### MT-10 — Latency budgets
Covers: REQ-NFR-003
1. Stopwatch three moments, five tries each: icon-click→first word; end-of-your-utterance→verdict
   speech; verdict→word visible in grid.
2. **PASS:** ≤ 1.5 s each in at least 4 of 5 tries (warm page).

### MT-11 — Recognition network failure
Covers: REQ-SPCH-004
1. Start a session; when the mic is listening, flip DevTools → Network → Offline; speak. Restore.
2. **PASS:** the extension announces a recognition problem and retries once; if it fails again it
   ends the session with an explanation (never a silent hang). `aborted` from stopping the session
   yourself produces no error speech.

### MT-12 — Places without a puzzle
Covers: REQ-LIFE-003
1. Click the icon on: (a) a nytimes.com news article, (b) the crosswords landing/archive page,
   (c) any non-NYT site.
2. **PASS:** (a),(b) panel opens, says it doesn't see a crossword, ends; (c) badge feedback only
   (✕ flash), no panel, no errors in the service-worker console.

### MT-13 — Conversation follows your clicks
Covers: REQ-NAV-008 REQ-PAGE-010
1. Mid-session while the mic is listening, click a different clue in the page's clue list.
2. **PASS:** the extension announces and reads the newly selected clue; entering answers via voice
   right after targets *that* clue. Our own automatic navigation does not re-trigger readouts
   (no echo loop).

### MT-14 — Question-mark clues sound right
Covers: REQ-READ-004 REQ-SPCH-006
1. Find a `?` clue (Minis usually have one; any daily does). Have it read.
2. **PASS:** you hear the clue (ideally with rising intonation — voice-dependent) AND the words
   "question mark". The caption shows the `?`.

### MT-15 — Network & storage audit
Covers: REQ-NFR-001 REQ-NFR-002
1. DevTools on the side panel + service worker: run a full session (MT-06 scale).
2. **PASS:** no `fetch`/XHR/WebSocket initiated by the extension contexts (browser-internal speech
   traffic doesn't appear as extension requests); `chrome.storage` is empty; panel Application tab
   shows no localStorage/IndexedDB writes; closing the session leaves nothing behind.

### MT-16 — Hint, help, repeat
Covers: REQ-HINT-001 REQ-HINT-002 REQ-CMD-002 REQ-READ-009
1. On a partially filled entry say "hint"; then "help"; then "repeat".
2. **PASS:** hint reads letters in order with "blank" for empties + "N of M filled"; help is one
   breath listing the core commands; repeat re-reads the clue verbatim; all three keep the session
   on the same clue.

### MT-17 — Second tab takes over
Covers: REQ-LIFE-009
1. Session running on tab A (Mini). Open the daily in tab B; click the icon there.
2. **PASS:** tab A's session goes silent/closed; tab B starts fresh; only one badge/mic at a time.

### MT-18 — Captions mirror the conversation
Covers: REQ-SPCH-007 REQ-SPCH-008
1. Run a few exchanges.
2. **PASS:** every spoken system line appears as a caption, and each of your utterances appears as
   `Heard: "..."` — nothing spoken-but-unshown.

### MT-19 — Tab disappears mid-session
Covers: REQ-LIFE-008
1. Mid-session: navigate the puzzle tab to nytimes.com home; repeat with closing the tab.
2. **PASS:** speech/mic stop within ~2 s, panel notes the session ended; no error spam, no zombie
   badge.

### MT-20 — Silence never gets nagged
Covers: REQ-CMD-005
1. Start a session and say nothing for over a minute. Keep the tab focused.
2. **PASS:** not a single spoken word about the silence — no "still there?", no sign-off. The
   session listens quietly and after ~60 s simply ends: mic indicator off, panel closes. Speaking
   (or clicking a clue) at any point restarts the clock.

### MT-21 — Inert when off
Covers: REQ-NFR-004
1. Extension installed, no session. Solve part of a puzzle by keyboard for a minute.
2. **PASS:** zero visible/behavioral difference vs. extension disabled (typing, navigation,
   timer, rebus button all normal); content-script console silent.

### MT-22 — The verification pipeline itself
Covers: REQ-NFR-006
1. Run `npm run verify` (tests + trace) — expect green and a full coverage matrix.
2. Add `REQ-FAKE-999` to any test title; run `npm run trace`.
3. **PASS:** step 1 green; step 2 fails naming the phantom ID. (Revert the edit.)

### MT-23 — Offline rehearsal (optional, no unique coverage)
1. `npm run build:dev`, `npm run fixture`, open `http://localhost:8787`, click the icon.
2. Expect the entire conversation loop to work against the fake page — useful for demos and for
   rehearsing every MT above without an NYT subscription.

### MT-24 — Looking away ends the session
Covers: REQ-LIFE-011
1. Mid-session: switch to another tab in the same window. Start again, then switch to a different
   application (or another Chrome window) without changing tabs.
2. **PASS:** in each case speech and mic stop within ~1 s, silently — no goodbye, panel closes,
   badge clears, no zombie session when you come back.
