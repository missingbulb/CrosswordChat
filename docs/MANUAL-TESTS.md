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
1. Open today's Mini. `chrome://extensions` → CrosswordChat → *Inspect views: service worker*.
2. In the service-worker console run:
   `chrome.tabs.query({active:true,currentWindow:true}).then(([t]) => chrome.tabs.sendMessage(t.id, {type:'cc:probe'})).then(r => console.table(r.items))`
3. **PASS:** every probe row shows `ok: true` (board, cells, letters, numbers, both clue lists,
   clue text, selection, no congrats modal); reported grid size matches the visible grid; the
   number of across/down clues matches the printed lists. Any failing row = FAIL → fix
   `selectors.js` first.

### MT-02 — Answer injection spike (the go/no-go test)
Covers: REQ-PAGE-005 REQ-PAGE-006 REQ-PAGE-007 REQ-PAGE-008 REQ-ANS-013
1. On the Mini with an empty grid, start a session; answer the first clue with a correct word.
2. Watch the grid while the extension enters it.
3. **PASS:** letters appear in the correct cells; the extension confirms by voice; saying a
   *wrong-but-fitting* word later also lands (letters visible), and the clue highlight follows the
   conversation. If letters do NOT appear: the extension must say entering failed (that part
   passing = REQ-ANS-013 PASS) — then escalate to the fallbacks in FEASIBILITY §3.

### MT-03 — Session start reads the highlighted clue
Covers: REQ-LIFE-001 REQ-LIFE-007 REQ-LIFE-010 REQ-READ-001 REQ-SPCH-001
1. On a fresh puzzle, click clue **3 Down** in the page's clue list.
2. Click the extension icon.
3. **PASS:** within ~1.5 s you hear at most a couple of greeting words, then "3 Down." + the clue
   text + "N letters." — and the mic starts listening (page console shows `[CrosswordChat] mic on`;
   Chrome shows the tab's mic-in-use indicator). Nothing visual opens. No tutorial monologue.

### MT-04 — Icon click kills the session instantly
Covers: REQ-LIFE-002
1. Start a session; while the clue is mid-readout, click the extension icon again.
2. **PASS:** audio stops mid-word (≤ ~0.5 s), badge clears, tab mic indicator gone, page console
   notes the session ended.

### MT-05 — Microphone permission denied
Covers: REQ-SPCH-003
1. chrome://settings/content/microphone → Block for `https://www.nytimes.com` (the mic now belongs
   to the page origin — or reset and click "Block" on the prompt). Start a session.
2. **PASS:** after the first readout, the extension says by voice that the mic is blocked and how
   to fix it, then ends the session. No prompt loops, no silent hang.

### MT-06 — Conversational solve, end to end
Covers: REQ-ANS-006 REQ-LIFE-005 REQ-NAV-001 REQ-NAV-002 REQ-NAV-003 REQ-NAV-007 REQ-SPCH-002 REQ-SPCH-005 REQ-CMD-001
1. Solve today's Mini entirely by voice: answer, *pass* on unknowns, come back around.
2. **PASS:** fitting answers are confirmed with a terse "Fits!" and appear in the grid; *pass* leaves cells
   untouched and reads the next unfilled clue in list order (wrapping); the page highlight always
   matches the spoken clue; the mic never listens while the extension is talking; completing the
   puzzle triggers NYT's congratulations AND the extension's "Hooray" + session end.

### MT-07 — Collision, override, and replace
Covers: REQ-ANS-008 REQ-ANS-012 REQ-ANS-016
1. Fill a crossing letter manually so your next voice answer conflicts (e.g. grid has A where your
   word needs I). Give that answer.
2. **PASS:** a quick one-liner names the position, the existing letter (and the crossing clue) —
   no options menu — and does NOT enter. Say "enter it anyway" → now it enters, replacing the
   letter. Then
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
2. **PASS:** all three open the unsupported-site popup (details in MT-31) — no session, no
   speech, no errors in the service-worker console. The spoken "I don't see a crossword here"
   is reserved for supported game URLs whose grid can't be parsed (hard to stage on the live
   site; the machine unit tests cover it).

### MT-13 — Conversation follows your clicks
Covers: REQ-NAV-008 REQ-PAGE-010
1. Mid-session while the mic is listening, click a different clue in the page's clue list.
2. While a long clue is being read out, click yet another clue.
3. While spelling a word ("spell", a few letters in), click a different clue.
4. **PASS:** in all three cases the extension abandons what it was doing (the readout stops within
   ~a second; the spelling buffer is discarded) and reads the newly selected clue; entering answers
   via voice right after targets *that* clue. Our own automatic navigation does not re-trigger
   readouts (no echo loop).

### MT-14 — Question-mark clues sound right
Covers: REQ-READ-004 REQ-SPCH-006
1. Find a `?` clue (Minis usually have one; any daily does). Have it read.
2. **PASS:** you hear the clue (ideally with rising intonation — voice-dependent) AND the words
   "question mark". The console line shows the `?`.

### MT-15 — Network & storage audit
Covers: REQ-NFR-001 REQ-NFR-002
1. DevTools on the puzzle page + service worker: run a full session (MT-06 scale).
2. **PASS:** no `fetch`/XHR/WebSocket initiated by the extension contexts (browser-internal speech
   traffic doesn't appear as extension requests); `chrome.storage` holds nothing beyond the
   settings object (`{strategy}` — REQ-NAV-012); no extension-written localStorage/IndexedDB
   entries appear; closing the session leaves nothing behind but console lines.

### MT-16 — Hint, help, repeat
Covers: REQ-HINT-001 REQ-HINT-002 REQ-CMD-002 REQ-READ-009
1. On a partially filled entry say "hint"; then "help"; then "repeat".
2. **PASS:** hint reads letters in order with "blank" for empties + "N of M filled"; help is one
   breath listing the core commands; repeat re-reads the clue verbatim; all three keep the session
   on the same clue.

### MT-17 — Second tab takes over
Covers: REQ-LIFE-009
1. Session running on tab A (Mini). Open the daily in tab B; click the icon there.
2. Repeat, but start tab B's session from the in-page bubble button (MT-30) instead.
3. **PASS:** both times tab A's session goes silent/closed; tab B starts fresh; only one
   badge/mic at a time.

### MT-18 — Console mirrors the conversation
Covers: REQ-SPCH-007 REQ-SPCH-008
1. Open the puzzle page's DevTools console (Verbose level on). Run a few exchanges.
2. **PASS:** every spoken system line appears as a `[CrosswordChat]` console line, and each of your
   utterances appears as `heard: "..."` — nothing spoken-but-unlogged, and nothing rendered into
   the page itself.

### MT-19 — Tab disappears mid-session
Covers: REQ-LIFE-008
1. Mid-session: navigate the puzzle tab to nytimes.com home; repeat with closing the tab.
2. **PASS:** speech/mic stop within ~2 s (the session lives in the page, so it dies with it; the
   service worker silences any in-flight utterance); no error spam, no zombie badge.

### MT-20 — Silence never gets nagged
Covers: REQ-CMD-005
1. Start a session and say nothing for over a minute. Keep the tab focused.
2. **PASS:** not a single spoken word about the silence — no "still there?", no sign-off. The
   session listens quietly and after ~60 s simply ends: tab mic indicator off, badge clears.
   Speaking (or clicking a clue) at any point restarts the clock.

### MT-21 — Inert when off
Covers: REQ-NFR-004
1. Extension installed, no session. Solve part of a puzzle by keyboard for a minute.
2. **PASS:** the only difference vs. extension disabled is the idle CrosswordChat bubble button
   in the toolbar (REQ-LIFE-012) — typing, navigation, timer, rebus and pencil buttons all
   behave normally; content-script console silent; no mic indicator, ever.

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
2. **PASS:** in each case speech and mic stop within ~1 s, silently — no goodbye, badge clears,
   no zombie session when you come back.

### MT-25 — "Stop" cuts any speech short
Covers: REQ-CMD-006
1. Start a session. While a clue is still being read, say "stop".
2. Start again; give a fitting answer, and while the "Fits!" confirmation is playing say "stop".
3. **PASS:** both times the audio halts promptly, the short sign-off plays, and the session ends.

### MT-26 — Undo, back, flip
Covers: REQ-ANS-017 REQ-NAV-009 REQ-NAV-010
1. Enter a fitting answer by voice; after the session moves on, say "undo".
2. Say "back". Then say "flip".
3. **PASS:** undo re-selects the answered clue, empties exactly the cells that answer filled
   (letters that were there beforehand come back), and confirms with a brief "Undone.";
   "back" moves to the previous clue in the list — including filled ones — and reads it; "flip"
   jumps to the crossing clue and reads it; the page highlight follows every move.

### MT-27 — Answer before the readout ends
Covers: REQ-SPCH-009
1. Start a session; while the clue is still being read, say a fitting answer.
2. On the next clue, mid-readout, say "next".
3. With sound on speakers (no headphones), stay silent through a full readout and the mic open.
4. **PASS:** steps 1–2 — the readout stops within ~a second and the answer/command is handled
   exactly as if spoken after the readout. Step 3 — the extension never reacts to its own voice
   (the echo guard discards it); no self-triggered replies, ever.

### MT-28 — Strategy setting and easiest-first skipping
Covers: REQ-NAV-011 REQ-NAV-012
1. Right-click the toolbar icon → Options. Pick "Most filled first (easiest)". Close the page.
2. Start a session on a partially solved puzzle and, without answering, say "next" several times.
3. Answer one clue that crosses an entry you skipped in step 2, then say "next" again.
4. Reopen Options; switch back to "In list order"; start a new session and say "next".
5. **PASS:** step 2 — each "next" lands on the open clue with the highest percentage of letters
   filled that you haven't just skipped: no ping-ponging between the top two; once every open
   clue has been skipped, "next" cycles back to the one skipped longest ago. Step 3 — the skipped
   entry whose letters just changed is offered again. Step 4 — the new session advances in plain
   list order; the setting survived the browser restart / new session.

### MT-29 — Override pencils the malformed crossing; undo restores pen
Covers: REQ-ANS-019 REQ-PAGE-012
1. On a fresh Mini, answer one Down clue by voice so several of its letters are in the grid.
2. Move to an Across clue that crosses it and give an answer that collides with that Down entry's
   letter; after the collision report, say "anyway".
3. Say "undo".
4. Toggle NYT's pencil button ON yourself, then answer another clue by voice.
5. **PASS:** step 2 — the new word lands in normal pen; the crossed Down entry's *remaining*
   letters turn gray (penciled), except any letter that also belongs to a fully filled entry —
   those keep their pen. Step 3 — the overriding word is removed, the Down entry's letters return
   exactly as they were and in pen (no gray left behind). Step 4 — our letters land in pen but the
   pencil toggle is back ON for you afterwards (the session never steals your toggle state).

### MT-30 — The in-page toolbar button
Covers: REQ-LIFE-012
1. Open the Mini. If the splash screen ("Ready to start solving?") shows, wait well past 30 s
   before clicking Play — the button must still appear afterwards. Find the CrosswordChat
   button — the same gold crossword-bubble tile as the extension icon — in the puzzle toolbar:
   immediately right of NYT's pencil toggle, or at the end of the tool row when no pencil is
   recognized (hover it: the tooltip names CrosswordChat). If it is missing, run the probe
   (MT-01) and check its `pencil toggle` and `toolbar` lines.
2. Click it. Answer one clue by voice. While the session runs, look at the button; then click it
   again mid-readout.
3. Reload the page and start a session from the *extension icon* instead; end it by voice
   ("goodbye").
4. **PASS:** step 2 — the click starts the session exactly like the icon (clue read, mic on,
   badge ON) and the tile inverts (ink tile, gold bubble) while the session runs; the second
   click cuts speech instantly and silently (like MT-04) and the tile returns to gold. Step 3 —
   the button also tracks sessions it didn't start: inverted during, gold after. The button
   never doubles up, and the rest of the toolbar looks and works untouched.

### MT-31 — Icon variants and the unsupported-site popup
Covers: REQ-LIFE-013 REQ-LIFE-014
1. Open four tabs: today's Mini, an NYT news article, the crosswords landing page, and any
   non-NYT site. Compare the extension's toolbar icon across the four.
2. In the Mini tab, navigate to an NYT article in the same tab, then go back.
3. Click the extension icon on the article tab; then on the Mini tab.
4. **PASS:** step 1 — the Mini tab shows the full-color icon; the other three show the gray
   variant. Step 2 — the icon follows the navigation both ways. Step 3 — on the article tab a
   small popup opens (no session, no speech) saying CrosswordChat isn't supported on this site,
   naming the NYT Mini/Midi/daily puzzles, and offering crosswords@missingbulb.com for support
   requests; on the Mini tab the click starts the session directly, no popup.
