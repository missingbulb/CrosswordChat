# CrosswordChat — Requirements

**Product:** Chrome extension (Manifest V3) that lets a user solve the New York Times crossword
conversationally: the extension reads clues aloud, the user answers by voice, the extension checks
the answer against the grid, enters it, and moves on.

**Status of this document:** Source of truth. Every requirement below carries a stable ID
(`REQ-<AREA>-<NNN>`). This document is *executable*: the traceability tool (`npm run trace`)
fails the build unless every requirement with `Status: Active` is referenced by at least one
automated test (in `tests/**/*.test.js`) or one manual test (in `docs/MANUAL-TESTS.md`).
See [§14 Executable requirements schema](#14-executable-requirements-schema).

Keywords **MUST** / **SHOULD** / **MAY** are used per RFC 2119.

---

## 1. Glossary

| Term | Meaning |
|---|---|
| **Puzzle** | The NYT crossword grid + clues on a `nytimes.com/crosswords/game/...` page (daily or Mini). |
| **Clue** | What NYT calls a clue; the user may call it a "definition". E.g. *17 Across: Little house*. |
| **Entry** | The sequence of grid cells a clue's answer occupies. |
| **Entry length** | Number of cells in the entry (= number of letters, ignoring rebus). |
| **Pattern** | The current per-cell contents of an entry, e.g. `H _ _ R T` (filled letters + blanks). |
| **Crossing** | The perpendicular clue that shares a given cell with the current entry. |
| **Collision** | A candidate answer letter that disagrees with a letter already in the grid at that cell. |
| **Session** | An active conversation, started/stopped by clicking the extension icon. |
| **Filled** | Every cell of an entry (or the grid) contains a letter. Filled ≠ correct. |
| **Solved** | NYT itself confirms the puzzle is correctly completed (congratulations modal). |
| **Homophone set** | Words pronounced (near-)identically with different spellings: *plain/plane*, *ate/eight*. The user says "homonyms"; we implement homophones. |
| **Utterance** | One chunk of recognized speech, delivered as an n-best list of alternative transcripts. |
| **Command** | An utterance that controls the conversation (*next*, *hint*, *repeat*, ...) rather than answering. |

## 2. Scope & assumptions

- **In scope (MVP):** NYT Daily crossword and the Mini, on desktop Chrome (≥ 116), English (`en-US`),
  one puzzle tab at a time. Voice-first interaction with a small side-panel UI showing captions.
- **Out of scope (MVP), analyzed in §13:** rebus squares, barge-in (interrupting TTS by speaking),
  NYT Check/Reveal integration, following cross-references, multiple simultaneous sessions,
  non-English puzzles, acrostics/other game types.
- **Assumptions:**
  - The user is logged in to NYT with whatever subscription the puzzle needs; we piggyback on the
    already-rendered page and never call NYT APIs ourselves.
  - The NYT page DOM is subject to change without notice. All DOM specifics are quarantined in one
    module and are verifiable in one click via a *selector probe* (REQ-PAGE-009, MT-01).
  - Letters are A–Z only. NYT answers never contain spaces/hyphens (they are stripped by convention).

## 3. Architecture constraints (why the code is split the way it is)

The problem decomposes into independently testable modules (see `docs/ARCHITECTURE.md`):

| Concern | Module | Depends on the NYT page? | Test style |
|---|---|---|---|
| Talk to the live page (read DOM, click, type) | `extension/src/page-adapter/` | **Yes — only place allowed to** | jsdom integration vs. a faithful fake NYT page + live-page manual probe |
| Interpret raw page data as a crossword | `extension/src/puzzle-model/` | No | unit |
| Decide what to do/say next | `extension/src/conversation/` | No | unit (pure state machine) |
| Turn intent into English (and clues into speech text) | `extension/src/conversation/phrases.js` | No | unit |
| Match utterances to answers (homophones, lengths, collisions) | `extension/src/matching/` | No | unit |
| Speech I/O (TTS/STT wrappers) | `extension/src/speech/` | No (browser APIs) | unit with fake browser APIs + manual |
| Wiring, lifecycle, UI shell | `extension/src/background/`, `sidepanel/`, `content/`, `app/` | Chrome APIs | manual + thin by design |

---

## 4. Puzzle model (MODEL)

The model is the pure, in-memory representation built from a page snapshot. Everything downstream
(matching, conversation) trusts it, so it gets its own requirements.

#### REQ-MODEL-001 — Numbering and clue↔cell mapping
- **Status:** Active · **Level:** MUST
- The model MUST derive standard crossword numbering from the grid geometry (a cell is numbered iff
  it starts an across entry — left edge or block to its left, with ≥2 open cells rightward — or
  similarly a down entry), MUST map every clue (`number` + `direction`) to its ordered cell indices,
  and MUST agree with the numbers rendered in the page DOM.
- Cases: grids with no blocks (Mini), blocks mid-row, entries of length ≥ 2 only (a 1-cell slot is
  not an entry).
- **Accept:** Given the 5×5 fixture and a 4×4 fixture with blocks, when the model is built, then every
  clue's cell list and number match the hand-computed expectation.
- **Verify:** unit `tests/unit/model.test.js`; manual MT-01 (live-page cross-check via probe).

#### REQ-MODEL-002 — Crossings
- **Status:** Active · **Level:** MUST
- For any position in an entry, the model MUST identify the crossing clue (id + human label such as
  *3 Down*) or `null` for uncrossed cells.
- **Accept:** Given the fixtures, when crossings are queried for known positions, then the expected
  clue labels are returned.
- **Verify:** unit `tests/unit/model.test.js`.

#### REQ-MODEL-003 — Pattern and progress
- **Status:** Active · **Level:** MUST
- The model MUST expose, per clue: the pattern (array of letter-or-null in entry order) and progress
  (`filled` / `length`). Empty cells are `null`, never `""` or space.
- **Accept:** Given a partially filled fixture grid, when pattern/progress are read, then they match
  the grid exactly.
- **Verify:** unit `tests/unit/model.test.js`.

#### REQ-MODEL-004 — Filled vs. solved are distinct
- **Status:** Active · **Level:** MUST
- The model MUST distinguish *grid full* (every non-block cell has a letter) from *solved* (the page
  reported success). A full grid MUST NOT be treated as solved (letters may be wrong).
- **Accept:** Given a full-but-unconfirmed snapshot, then `isFull() === true` and `isSolved() === false`;
  given a snapshot with the success signal, then `isSolved() === true`.
- **Verify:** unit `tests/unit/model.test.js`.

#### REQ-MODEL-005 — Canonical clue order
- **Status:** Active · **Level:** MUST
- The model MUST expose the NYT list order: all Across clues by ascending number, then all Down
  clues by ascending number.
- **Accept:** Given the fixtures, then `orderedClueIds` equals the expected sequence.
- **Verify:** unit `tests/unit/model.test.js`.

---

## 5. Session lifecycle (LIFE)

#### REQ-LIFE-001 — Start on icon click
- **Status:** Active · **Level:** MUST
- Clicking the extension icon on a NYT crossword page with an unsolved puzzle MUST start a session:
  open the side panel, snapshot the puzzle, and read the first clue (per REQ-LIFE-007).
- **Accept:** Given an unsolved puzzle page, when the icon is clicked, then within the latency budget
  (REQ-NFR-003) the current clue is spoken and the mic starts listening.
- **Verify:** unit `tests/unit/machine.test.js` (START event → clue readout → listen); manual MT-03.

#### REQ-LIFE-002 — Icon click ends an active session immediately
- **Status:** Active · **Level:** MUST
- Clicking the icon during a session MUST end it: speech output stops mid-word, the mic stops,
  the panel closes. No goodbye message (the user asked for silence). Target ≤ 500 ms to silence.
- **Accept:** Given a session mid-readout, when the icon is clicked, then audio stops and the mic
  indicator disappears.
- **Verify:** unit `tests/unit/machine.test.js` (TOGGLE_OFF → END with no SAY); manual MT-04.

#### REQ-LIFE-003 — Clicking where there is no puzzle
- **Status:** Active · **Level:** MUST
- On a non-NYT page the icon MUST give lightweight visual feedback (action badge) and MUST NOT open
  a session. On an NYT page without a detectable puzzle, the panel MUST say so briefly
  ("I don't see a crossword here") and end.
- Cases: nytimes.com article page; chrome:// pages; crossword archive/landing page (no grid).
- **Accept:** As above for each case.
- **Verify:** unit `tests/unit/machine.test.js` (START with status `not-found`); manual MT-12.

#### REQ-LIFE-004 — Puzzle already solved at start
- **Status:** Active · **Level:** MUST
- If the snapshot at session start reports solved, the session MUST announce it cheerfully
  ("This one's already solved — hooray!") and end without listening.
- **Accept:** Given a solved puzzle, when a session starts, then exactly one celebratory utterance is
  spoken and the session ends (no LISTEN action ever issued).
- **Verify:** unit `tests/unit/machine.test.js`; manual MT-08.

#### REQ-LIFE-005 — Puzzle becomes solved mid-session
- **Status:** Active · **Level:** MUST
- When the puzzle transitions to solved during a session — whether because of an answer we entered
  or the user typing manually — the session MUST celebrate ("Hooray, solved it!") and end.
- **Accept:** Given a session, when the solved signal arrives (via entry result or page event), then
  the celebration is spoken and the session ends.
- **Verify:** unit `tests/unit/machine.test.js`; manual MT-06.

#### REQ-LIFE-006 — Grid full but not solved
- **Status:** Active · **Level:** MUST
- If every cell is filled but NYT has not confirmed success, the session MUST say so
  ("The grid is full, but something's not right yet") and keep the conversation alive so the user can
  revisit entries (navigation + replace flows still work). It MUST NOT claim which letters are wrong
  (we don't know) and MUST NOT celebrate.
- **Accept:** Given a full-but-wrong grid after an entry, then the discrepancy message is spoken and
  the session continues listening on the current clue.
- **Verify:** unit `tests/unit/machine.test.js`; manual MT-09.

#### REQ-LIFE-007 — First clue read = currently highlighted clue
- **Status:** Active · **Level:** MUST
- The first clue read MUST be the one highlighted on the page at session start. If none can be
  determined, fall back to the first not-fully-filled clue in list order; if all are filled, follow
  REQ-LIFE-006's flow starting at the first clue.
- **Accept:** Given 3 Down is selected on the page, when the session starts, then 3 Down is read first.
- **Verify:** unit `tests/unit/machine.test.js`; manual MT-03.

#### REQ-LIFE-008 — Page disappears mid-session
- **Status:** Active · **Level:** MUST
- If the puzzle tab navigates away, reloads, or closes during a session, the session MUST end and
  stop all audio within ~2 s; the panel notes why. No retries against a dead page.
- **Accept:** Given a session, when the tab is closed or navigated, then speech/mic stop and the panel
  reports the session ended.
- **Verify:** manual MT-19.

#### REQ-LIFE-009 — One session at a time
- **Status:** Active · **Level:** MUST
- At most one session may exist. Clicking the icon on a second crossword tab while a session runs
  elsewhere MUST end the first session and start on the new tab.
- **Accept:** Given a session on tab A, when the icon is clicked on tab B, then A's session ends and
  B's starts.
- **Verify:** manual MT-17.

#### REQ-LIFE-010 — Minimal preamble
- **Status:** Active · **Level:** MUST
- Session start MUST NOT lecture. At most a two-or-three-word greeting glued to the first clue
  readout ("Let's solve. 17 Across. ..."). Discoverability comes from the *help* command
  (REQ-CMD-002), not a tutorial.
- **Accept:** Given session start, then exactly one SAY action is produced and it is the clue readout
  (with greeting folded in).
- **Verify:** unit `tests/unit/machine.test.js`.

#### REQ-LIFE-011 — Looking away ends the session
- **Status:** Active · **Level:** MUST
- The session MUST end — instantly and silently, like the icon toggle (REQ-LIFE-002) — when the
  puzzle tab stops being the active tab, or when the Chrome window loses focus (the user switched
  to another window or another app). The microphone never stays open on a puzzle the user is not
  looking at.
- **Accept:** Given a running session, when the user switches to another tab or to a different
  app, then speech and mic stop within ~1 s with no spoken goodbye and the badge clears.
- **Verify:** manual MT-24.

---

## 6. Clue readout (READ)

The NYT clue text is rich: italics, brackets, quotes, blanks (`___`), question marks, HTML
entities. The readout must convey what the eye would see.

**Readout grammar (normative):**

```
[Greeting | "Back to the top."] <number> <direction>. <spoken clue text>.
[<formatting annotations>] <N> letters.
```

#### REQ-READ-001 — Readout structure
- **Status:** Active · **Level:** MUST
- Every clue readout MUST contain, in order: clue label ("17 Across"), the clue text, any formatting
  annotations (REQ-READ-002/003/006), and the letter count last (REQ-READ-008).
- **Accept:** Given clue 1A "Organ with four chambers" (5 letters), then the readout is
  "1 Across. Organ with four chambers. 5 letters." (modulo greeting).
- **Verify:** unit `tests/unit/verbalizer.test.js`.

#### REQ-READ-002 — Italics are announced
- **Status:** Active · **Level:** MUST
- If part of the clue is italic (`<i>`/`<em>` in NYT HTML), the readout MUST read the clue text
  normally, then append: single word → `The word 'X' is in italics.`; multi-word span →
  `The phrase 'X Y' is in italics.`; whole clue italic → `The whole clue is in italics.`
  Multiple italic spans are each announced.
- Rationale: italics distinguish e.g. titles (*Little House*) from plain words — meaning-bearing.
- **Accept:** Given clue HTML `Little <i>house</i>`, then the readout contains
  "Little house. The word 'house' is in italics."
- **Verify:** unit `tests/unit/verbalizer.test.js`, `tests/unit/clue-html.test.js`.

#### REQ-READ-003 — Bracketed clues are announced
- **Status:** Active · **Level:** MUST
- If the entire clue is wrapped in square brackets (NYT convention for non-verbal utterances,
  e.g. `[Sigh]`), the readout MUST say `The clue is in brackets:` and then the inner text (brackets
  themselves are not read as punctuation).
- Case: brackets *inside* a clue (e.g. `Word after "boo" [not "hoo"]`) → read text as-is; only
  whole-clue brackets get the announcement (partial brackets are rare editorial asides).
- **Accept:** Given clue `[Treat badly]`, then readout contains "The clue is in brackets: Treat badly."
- **Verify:** unit `tests/unit/verbalizer.test.js`.

#### REQ-READ-004 — Question-mark clues
- **Status:** Active · **Level:** MUST
- A trailing `?` (NYT signal for wordplay) MUST be conveyed twice: (a) the `?` is kept in the text
  handed to TTS so capable voices apply question intonation, and (b) the phrase `Question mark.` is
  appended as an explicit annotation (default ON, configurable constant), because intonation alone
  is unreliable across voices and the `?` is semantically load-bearing in crosswords.
- **Accept:** Given clue `It might go viral?`, then the spoken text ends with `viral?` and contains
  the annotation "Question mark."
- **Verify:** unit `tests/unit/verbalizer.test.js`; manual MT-14 (listen check).

#### REQ-READ-005 — Blanks (`___`) are read as "blank"
- **Status:** Active · **Level:** MUST
- Every run of ≥ 2 underscores MUST be spoken as the word `blank`. (TTS engines otherwise skip it
  or read "underscore underscore...".)
- **Accept:** Given clue `"The ___ of the Matter"`, then the spoken text contains `The blank of the Matter`.
- **Verify:** unit `tests/unit/verbalizer.test.js`.

#### REQ-READ-006 — Quoted text is announced
- **Status:** Active · **Level:** SHOULD
- If the clue contains a quoted span (straight or curly double quotes), append annotation
  `Part of the clue is in quotes.`; if the whole clue is quoted, `The clue is in quotes.`
  (Quotes signal spoken phrases/titles — meaning-bearing, same rationale as italics.)
- **Accept:** Given `"Hooray!"`, then annotation "The clue is in quotes." is present.
- **Verify:** unit `tests/unit/verbalizer.test.js`.

#### REQ-READ-007 — HTML entities are decoded
- **Status:** Active · **Level:** MUST
- Clue HTML entities (`&amp;`, `&quot;`, `&#39;`, `&ldquo;`, `&eacute;`, numeric forms, ...) MUST be
  decoded to their characters before speaking, and unknown tags (`<b>`, `<sub>`, ...) MUST be
  stripped while keeping their text.
- **Accept:** Given `Tom &amp; Jerry`, then the spoken text is `Tom & Jerry` (TTS reads "and").
- **Verify:** unit `tests/unit/clue-html.test.js`.

#### REQ-READ-008 — Letter count is spoken last
- **Status:** Active · **Level:** MUST
- Every clue readout MUST end with the entry length: `6 letters.` The count is the number of cells
  (rebus caveat documented in §13).
- **Accept:** Given any clue readout, then the final sentence is `<N> letters.`
- **Verify:** unit `tests/unit/verbalizer.test.js`.

#### REQ-READ-009 — Repeat
- **Status:** Active · **Level:** MUST
- The command *repeat* (synonyms in REQ-CMD-001) MUST re-read the current clue readout in full
  (without greeting), then listen again.
- **Accept:** Given a session listening on 3 Down, when the user says "repeat", then 3 Down's readout
  is spoken again.
- **Verify:** unit `tests/unit/machine.test.js`; manual MT-16.

#### REQ-READ-010 — Cross-reference clues are read literally
- **Status:** Active · **Level:** MUST (literal reading); following the reference is REQ-FUT-004
- Clues like `See 17-Across` or `With 5-Down, ...` MUST be read as-is. The MVP does not navigate to
  the referenced clue automatically.
- **Accept:** Given clue `See 17-Across`, then the spoken text is exactly that (plus length).
- **Verify:** unit `tests/unit/verbalizer.test.js`.

#### REQ-READ-011 — Editorial tags are read literally
- **Status:** Active · **Level:** MUST
- Suffix tags such as `: Abbr.`, `, for short`, `, e.g.`, `, in brief` MUST be preserved verbatim in
  the spoken text (they tell the solver the answer form). No expansion, no omission.
- **Accept:** Given `Violinist's supply: Abbr.`, then the spoken text contains `: Abbr.` read as-is.
- **Verify:** unit `tests/unit/verbalizer.test.js`.

**Formatting decision table (spoken output for clue variants):**

| Clue source (HTML) | Spoken text | Annotations |
|---|---|---|
| `Organ with four chambers` | same | — |
| `Little <i>house</i>` | `Little house.` | `The word 'house' is in italics.` |
| `<i>Little house</i>` | `Little house.` | `The whole clue is in italics.` |
| `[Treat badly]` | `Treat badly.` | `The clue is in brackets:` (prefix) |
| `It might go viral?` | `It might go viral?` | `Question mark.` |
| `&ldquo;The ___ of the Matter&rdquo;` | `"The blank of the Matter"` | `The clue is in quotes.` |
| `See 17-Across` | `See 17-Across.` | — |
| `Sticky stuff: Abbr.` | `Sticky stuff: Abbr.` | — |

---

## 7. Navigation between clues (NAV)

#### REQ-NAV-001 — "next"/"pass" advances without entering anything
- **Status:** Active · **Level:** MUST
- The commands *next*, *pass*, *skip* (full lexicon REQ-CMD-001) MUST leave the current entry
  untouched, advance to the next clue per the active strategy, sync the page highlight, and read
  the new clue.
- **Accept:** Given listening on 1 Across, when the user says "pass", then no letters change and
  the next clue is read.
- **Verify:** unit `tests/unit/machine.test.js`; manual MT-06.

#### REQ-NAV-002 — Default strategy: list order
- **Status:** Active · **Level:** MUST
- The default strategy MUST be NYT list order (REQ-MODEL-005) starting after the current clue,
  wrapping from the last Down back to the first Across.
- **Accept:** Given current = last Down with earlier clues unfilled, when advancing, then the first
  unfilled Across is chosen and `wrapped` is signaled.
- **Verify:** unit `tests/unit/strategies.test.js`.

#### REQ-NAV-003 — Fully filled clues are skipped when advancing
- **Status:** Active · **Level:** MUST
- Advancing MUST skip entries that are already completely filled (their letters may still be edited
  via the replace flow, but we don't offer them proactively). If *no* unfilled clue exists, stay on
  the current clue (REQ-LIFE-006 covers the announcement).
- **Accept:** Given the next two clues in order are filled, when advancing, then the third is selected.
- **Verify:** unit `tests/unit/strategies.test.js`, `tests/unit/machine.test.js`.

#### REQ-NAV-004 — Strategy: most-filled-first
- **Status:** Active · **Level:** MUST
- A second strategy MUST rank unfilled clues by most filled-in letters (descending), tie-broken by
  list order, cycling through the current one last. Rationale: entries with many crossings filled
  are easiest to answer.
- **Accept:** Given entries with 3/5, 1/4, 0/3 letters filled, when advancing under most-filled, then
  the 3/5 entry is chosen.
- **Verify:** unit `tests/unit/strategies.test.js`.

#### REQ-NAV-005 — Switching strategy by voice
- **Status:** Active · **Level:** SHOULD
- Saying *"switch to most filled"* / *"go in order"* (lexicon REQ-CMD-001) SHOULD switch the active
  strategy for the rest of the session, confirm briefly, and keep listening on the current clue.
- **Accept:** Given a session, when the user says "switch to most filled", then the acknowledgement is
  spoken and subsequent *next* uses the new strategy.
- **Verify:** unit `tests/unit/machine.test.js`.

#### REQ-NAV-006 — Wrap-around is announced
- **Status:** Active · **Level:** SHOULD
- When list-order advancing wraps past the end, the next readout SHOULD be prefixed with
  "Back to the top." so the user keeps their bearings.
- **Accept:** Given a wrap, then the readout starts with the wrap phrase.
- **Verify:** unit `tests/unit/machine.test.js`, `tests/unit/verbalizer.test.js`.

#### REQ-NAV-007 — Page highlight follows the conversation
- **Status:** Active · **Level:** MUST
- Whenever the conversation moves to a clue, the page selection MUST be updated (as if the user
  clicked that clue) so screen and audio agree.
- **Accept:** Given advancing to 4 Down, then the page shows 4 Down highlighted.
- **Verify:** integration `tests/integration/page-adapter.test.js` (navigator); unit
  `tests/unit/machine.test.js` (SELECT_CLUE action emitted); manual MT-06.

#### REQ-NAV-008 — Conversation follows manual selection
- **Status:** Active · **Level:** SHOULD
- If the user clicks a different clue/cell on the page while the session is listening, the
  conversation SHOULD follow: announce and read the newly selected clue. Selection changes caused by
  our own writing/navigation MUST NOT trigger this (no echo loops).
- **Accept:** Given listening on 1A, when the page selection changes to 3D (user click), then 3D is
  read; when selection events arrive for the clue we already track, nothing happens.
- **Verify:** unit `tests/unit/machine.test.js`; manual MT-13.

---

## 8. Answers: hearing, checking, entering (ANS)

This is the heart of the product. Speech recognition is *phonetic*; crossword answers are
*orthographic*. The matcher must bridge that gap.

**Evaluation pipeline (normative):** for each utterance —

1. Command check first (REQ-CMD-001, REQ-ANS-014). If a command matches, it wins.
2. For each STT alternative (n-best, REQ-ANS-004): tokenize; normalize digits/ordinals to words
   (REQ-ANS-002); expand token-level homophones (REQ-ANS-003); join tokens to a candidate word
   (REQ-ANS-001, REQ-ANS-015). The unexpanded join of the top alternative is the **literal**.
3. Keep candidates that are pure A–Z; drop candidates the user already rejected (REQ-ANS-010).
4. Gate by entry length (REQ-ANS-005). No length match → report per REQ-ANS-007.
5. Among length-fitting candidates, check the pattern. Exactly one pattern-fitting spelling from the
   best alternative → accept (REQ-ANS-006). Several homophone spellings fit → ask (REQ-ANS-009).
   None fit the pattern → report the collision for the best candidate (REQ-ANS-008).

**Worked examples (these exact cases are unit-tested):**

| Entry needs | Grid pattern | User says | STT hears | Outcome |
|---|---|---|---|---|
| 5 | `_____` | "heart" | `heart` | fits → enter HEART |
| 3 | `___` | "ate" | `8` | digit→EIGHT (5, no) → homophone ATE (3) → fits, spelled out loud |
| 5 | `_L___` | "plain" | `plain` | PLAIN and PLANE both fit pattern → disambiguate |
| 5 | `_R___` | "plain" | `plain` | only PLANE fits? no — PLAIN collides at 2 (`R`≠`L`)... see unit fixtures |
| 4 | `____` | "a lot" | `a lot` | join → ALOT (4) → fits |
| 6 | `______` | "ocelot" | `ocelot` | 6 → fits |
| 4 | `____` | "ocelot" | `ocelot` | 6 ≠ 4 → "OCELOT is 6 letters; we need 4" |
| 5 | `HEA_T` | "heist" | `heist` | length 5 ok; `I` vs `A` at position 3 → collision report |
| 4 | `____` | "pass" | `pass` | command *pass* wins → skip clue (say "answer pass" to play PASS) |

#### REQ-ANS-001 — Answer normalization
- **Status:** Active · **Level:** MUST
- Candidate words MUST be normalized to uppercase A–Z only: spaces, hyphens, apostrophes, periods
  and all punctuation removed (`a lot` → `ALOT`, `don't` → `DONT`, `U.S.A.` → `USA`).
- **Accept:** Given the examples above, then normalization output matches.
- **Verify:** unit `tests/unit/matching.test.js`.

#### REQ-ANS-002 — Digits and ordinals become words
- **Status:** Active · **Level:** MUST
- Numeric tokens MUST be converted to their word form before matching: `8` → `EIGHT`, `42` →
  `FORTYTWO`, `1984` → `NINETEENEIGHTYFOUR` (year convention for 1100–1999 and 2010–2099;
  2000–2009 → `TWOTHOUSAND...`), `1st` → `FIRST`. Unhandleable numbers fall back to per-digit words.
- Rationale: STT loves emitting digits; crossword grids only hold letters.
- **Accept:** Given the listed inputs, then the listed outputs.
- **Verify:** unit `tests/unit/matching.test.js`.

#### REQ-ANS-003 — Homophone expansion
- **Status:** Active · **Level:** MUST
- Every token MUST be expanded through a bundled homophone dictionary (≈90 curated sets: plain/plane,
  ate/eight, to/too/two, right/rite/write/wright, ...) and each combination considered as a
  candidate (cartesian product, capped, literal-first ordering). The dictionary is local data —
  no network (REQ-NFR-001).
- **Accept:** Given "eight" with entry length 3, then candidate ATE is found and fits.
- **Verify:** unit `tests/unit/matching.test.js`.

#### REQ-ANS-004 — All STT alternatives are considered
- **Status:** Active · **Level:** MUST
- The matcher MUST consume the full n-best list (target ≥ 3 alternatives, see REQ-SPCH-002), in
  order, preferring earlier (higher-confidence) alternatives.
- **Accept:** Given alternatives ["playing", "plane"] for a 5-cell entry `P____`, then PLANE from the
  second alternative is used when the first yields nothing.
- **Verify:** unit `tests/unit/matching.test.js`.

#### REQ-ANS-005 — Length gate
- **Status:** Active · **Level:** MUST
- A candidate MUST match the entry length exactly to be enterable. Length is checked before pattern.
- **Accept:** Given length-4 entry and candidates of lengths 3/5/6, then none pass the gate.
- **Verify:** unit `tests/unit/matching.test.js`.

#### REQ-ANS-006 — Fit → confirm → enter → advance
- **Status:** Active · **Level:** MUST
- When exactly one spelling fits length + pattern: say it fits (`"HEART — 5 letters. It fits."`);
  if the accepted spelling differs from the literal transcript (homophone/digit rescue), spell it
  out loud first (`"E-I-G-H-T... eight, 5 letters. It fits."`); then enter it into the grid, then
  advance per strategy and read the next clue. Entering is verified per REQ-ANS-013.
- **Accept:** Given a fitting answer, then actions occur in order SAY(fit) → ENTER → SELECT/SAY(next
  clue) and the grid contains the word.
- **Verify:** unit `tests/unit/machine.test.js`, `tests/unit/matching.test.js` (spelledDifferently
  flag); manual MT-06.

#### REQ-ANS-007 — Length mismatch is reported with numbers
- **Status:** Active · **Level:** MUST
- When no candidate passes the length gate, the reply MUST name what was heard, its length, and the
  needed length — including homophone variants when they differ:
  `"I heard 'eight'. EIGHT is 5 letters, ATE is 3 — we need 4."` Up to 3 variants are reported.
  Then keep listening (same clue).
- **Accept:** Given "ocelot" for a 4-entry, then the reply contains OCELOT, 6, and 4.
- **Verify:** unit `tests/unit/matching.test.js` (variant list), `tests/unit/verbalizer.test.js`
  (phrasing), `tests/unit/machine.test.js` (stays on clue).

#### REQ-ANS-008 — Collision is reported letter-by-spot
- **Status:** Active · **Level:** MUST
- When a candidate fits the length but disagrees with existing grid letters, the reply MUST state,
  for each colliding position (report up to 3): the ordinal position, the candidate's letter, the
  letter already in the grid, and — when known — the crossing clue's label:
  `"HEIST fits the length, but the third letter would be I, and the grid already has A there from
  2 Down."` The word is NOT entered; the user may say *enter it anyway* (REQ-ANS-012), give a new
  answer, or pass.
- **Accept:** Given pattern `HEA_T` and candidate HEIST, then the collision report names position 3,
  I, A (and the crossing label when the model provides one).
- **Verify:** unit `tests/unit/matching.test.js` (positions), `tests/unit/machine.test.js` (cross
  label enrichment, no ENTER emitted), `tests/unit/verbalizer.test.js` (phrasing); manual MT-07.

#### REQ-ANS-009 — Ambiguous homophones ask the user
- **Status:** Active · **Level:** MUST
- When two or more *different spellings* from the same utterance fit length + pattern (plain/plane
  on `_L___`), the system MUST NOT guess. It MUST offer the spellings
  (`"That could be P-L-A-I-N or P-L-A-N-E. First or second?"`) and accept: *first/second/third*,
  a re-statement, a new answer, or *pass*.
- **Accept:** Given the plain/plane case, then a disambiguation prompt is produced and "second"
  selects PLANE.
- **Verify:** unit `tests/unit/matching.test.js` (ambiguous outcome), `tests/unit/machine.test.js`
  (choice flow).

#### REQ-ANS-010 — "You misheard" correction
- **Status:** Active · **Level:** MUST
- *"You misheard"* / *"that's not what I said"* MUST mark the last candidate(s) rejected (excluded
  from future evaluation this clue) and re-prompt. *"I meant X"* / *"no, I said X"* MUST evaluate X
  directly. Rejections reset when the conversation moves to another clue.
- **Accept:** Given HEART was heard and rejected, when the same utterance arrives again, then HEART
  is not proposed; given "I meant plane", then PLANE is evaluated.
- **Verify:** unit `tests/unit/machine.test.js`.

#### REQ-ANS-011 — Spelling mode
- **Status:** Active · **Level:** MUST
- *"Let me spell it"* MUST enter spelling mode: letters are collected from utterances accepting
  bare letters ("A"), letter-name homophones (bee→B, sea→C, are→R, why→Y, double u→W, ...) and the
  NATO alphabet (alfa/alpha→A, bravo→B, ...). Controls: *undo/delete* removes the last letter,
  *done/that's it* evaluates early, *cancel/never mind* leaves spelling mode. Reaching the entry
  length auto-evaluates. Progress is echoed after each utterance. The assembled word then flows
  through the normal pipeline (pattern check, entry) as a literal.
- **Accept:** Given entry length 5 and utterances "H", "echo", "are", "tango? no — undo", ... the
  buffer behaves as specified and evaluates at length 5.
- **Verify:** unit `tests/unit/matching.test.js` (letter parsing), `tests/unit/machine.test.js`
  (mode flow).

#### REQ-ANS-012 — Explicit override enters despite collisions
- **Status:** Active · **Level:** MUST
- After a collision report, *"enter it anyway"* / *"overwrite"* MUST enter the candidate, replacing
  the colliding letters (they were themselves unverified user input). Override MUST never happen
  implicitly.
- **Accept:** Given a collision report for HEIST, when the user says "enter it anyway", then the grid
  reads HEIST and the conversation advances.
- **Verify:** unit `tests/unit/machine.test.js`; manual MT-07.

#### REQ-ANS-013 — Writes are verified
- **Status:** Active · **Level:** MUST
- After entering a word, the page adapter MUST re-read the entry from the DOM and confirm every cell.
  On mismatch (page ignored keystrokes, layout drift...), the session MUST say entering failed and
  keep the clue current — never silently pretend success.
- **Accept:** Given a page that swallows input, when entry completes, then `ok:false` is reported and
  the failure utterance is spoken.
- **Verify:** integration `tests/integration/page-adapter.test.js`; unit `tests/unit/machine.test.js`
  (ENTRY_RESULT !ok); manual MT-02.

#### REQ-ANS-014 — Command-word answers need an escape hatch
- **Status:** Active · **Level:** MUST
- A bare command word is always a command (saying "pass" skips, even into a 4-cell entry).
  Prefixing with *answer/guess/the word is* MUST force literal treatment: "answer pass" plays PASS.
- **Accept:** Given "pass" → command; given "answer pass" on a 4-entry → PASS evaluated as a word.
- **Verify:** unit `tests/unit/matching.test.js`, `tests/unit/machine.test.js`.

#### REQ-ANS-015 — Multi-word utterances join
- **Status:** Active · **Level:** MUST
- Multi-token utterances MUST join into one candidate (`"a lot"` → ALOT, `"ice cream"` → ICECREAM),
  after per-token digit/homophone processing.
- **Accept:** Given "a lot" for a 4-entry, then ALOT fits.
- **Verify:** unit `tests/unit/matching.test.js`.

#### REQ-ANS-016 — Replacing a fully filled entry requires confirmation
- **Status:** Active · **Level:** MUST
- If the current entry is already completely filled and the user offers a *different* fitting word,
  the system MUST ask before replacing (`"That entry already reads HEART. Replace it with HEIST?"`);
  *yes* replaces, *no* keeps and re-prompts. Offering the identical word just confirms and advances.
- For a fully filled entry only the length gate applies — its letters are exactly what a new
  answer would replace, so they are not collision-checked (collisions, REQ-ANS-008, are about
  *partially* filled entries whose letters come from crossings).
- **Accept:** Given filled HEART and utterance "heist" (fits), then the confirm question is asked and
  "yes" rewrites the entry.
- **Verify:** unit `tests/unit/machine.test.js`.

---

## 9. Hints (HINT)

#### REQ-HINT-001 — Pattern hint
- **Status:** Active · **Level:** MUST
- *"hint" / "what do I have"* MUST read the current entry's pattern letter-by-letter in order, with
  empty cells spoken as "blank": `"H, blank, blank, R, T."`, followed by the progress summary
  (REQ-HINT-002). Then listen again on the same clue.
- **Accept:** Given pattern `H__RT`, then that exact readout is produced.
- **Verify:** unit `tests/unit/machine.test.js`, `tests/unit/verbalizer.test.js`; manual MT-16.

#### REQ-HINT-002 — Progress summary
- **Status:** Active · **Level:** SHOULD
- The hint SHOULD end with `"3 of 5 letters filled."` (0 filled → "Nothing filled in yet.").
- **Accept:** Given the pattern above, then the summary reads 3 of 5.
- **Verify:** unit `tests/unit/verbalizer.test.js`.

#### REQ-HINT-003 — Crossing-clue hint
- **Status:** Planned · **Level:** MAY
- *"What crosses the second letter?"* MAY read the crossing clue for that position. Deferred; the
  model already exposes crossings (REQ-MODEL-002).

---

## 10. Command grammar & conversational control (CMD)

#### REQ-CMD-001 — Command lexicon
- **Status:** Active · **Level:** MUST
- The recognizer MUST support this lexicon (case/punctuation-insensitive, matched on the whole
  normalized utterance; `…` marks a captured argument). This table is normative; the unit test
  iterates it.

| Intent | Utterances |
|---|---|
| next | next · next clue · next one · pass · pass on this · skip · skip it · skip this one · move on |
| repeat | repeat · repeat that · again · say again · say that again · read it again · what · come again |
| hint | hint · hints · give me a hint · what do i have · what's there · what's filled in · read the letters · pattern |
| help | help · what can i say · commands · options |
| stop | stop · goodbye · bye · end · end session · quit · exit · we're done · i'm done · stop listening |
| spell | spell · spell it · let me spell · let me spell it · i'll spell it · spelling |
| enter-anyway | enter it anyway · enter anyway · force it · overwrite · put it in anyway · replace it · use it anyway |
| misheard | you misheard · you misheard me · that's not what i said · you heard wrong · wrong word · no i said … · i meant … · i said … |
| answer (escape) | answer … · guess … · the answer is … · the word is … · try … |
| strategy | switch to most filled · most filled first · switch to most solved · go in order · switch to list order · read in order |
| yes (contextual) | yes · yeah · yep · sure · correct · right · do it |
| no (contextual) | no · nope · cancel · never mind · keep it · leave it |
| choice (contextual) | first · the first one · second · the second one · third · the third one |

- Contextual intents (yes/no/choice) apply only in their modes (confirm-replace, disambiguation);
  elsewhere they fall through to answer evaluation (YES may be an answer!).
- **Accept:** Given each utterance above, then the intent is recognized; given "yes" while not in a
  confirm mode, then it is evaluated as an answer.
- **Verify:** unit `tests/unit/matching.test.js` (table-driven), `tests/unit/machine.test.js`
  (contextual behavior).

#### REQ-CMD-002 — Help
- **Status:** Active · **Level:** MUST
- *help* MUST speak a one-breath summary of the core commands (answer, pass/next, repeat, hint,
  spell, stop) and keep listening.
- **Accept:** Given "help", then the help utterance is spoken and the clue stays current.
- **Verify:** unit `tests/unit/machine.test.js`; manual MT-16.

#### REQ-CMD-003 — Unintelligible input re-prompts
- **Status:** Active · **Level:** MUST
- When an utterance yields no command and no usable candidate (e.g. empty after normalization), the
  system MUST say it didn't catch that (with a nudge toward *help*) and listen again. It MUST NOT
  enter anything.
- **Accept:** Given garbage input, then the didn't-catch utterance is spoken and no grid change occurs.
- **Verify:** unit `tests/unit/machine.test.js`.

#### REQ-CMD-004 — Stop by voice
- **Status:** Active · **Level:** MUST
- *stop/goodbye* MUST end the session with a short sign-off (unlike the icon toggle, which is
  instant and silent — REQ-LIFE-002).
- **Accept:** Given "goodbye", then a sign-off is spoken and the session ends.
- **Verify:** unit `tests/unit/machine.test.js`.

#### REQ-CMD-005 — Silence is fine; after a minute the mic quietly closes
- **Status:** Active · **Level:** MUST
- This is a thinking game: long pauses between utterances are normal, so silence MUST NOT be
  nagged about — empty listen cycles (STT `no-speech`) produce no speech, ever. The session keeps
  listening quietly; once ~60 s pass with nothing heard (`SILENCE_TIMEOUT_MS`), it ends silently —
  the mic just stops, no re-prompt, no sign-off. Heard speech or user activity on the puzzle
  (clicking a clue, typing letters) resets the clock.
- **Accept:** Given consecutive no-speech cycles totalling under 60 s, then nothing is spoken and
  listening continues; once accumulated silence reaches 60 s, the session ends without a word.
- **Verify:** unit `tests/unit/machine.test.js`, `tests/unit/orchestrator.test.js`; manual MT-20.

---

## 11. Speech I/O (SPCH)

#### REQ-SPCH-001 — Text-to-speech
- **Status:** Active · **Level:** MUST
- Speech output MUST use `chrome.tts` when available (extension contexts; unaffected by page
  autoplay policy) and fall back to `speechSynthesis`. The port MUST expose `speak(text) → Promise`
  (resolving on end/interruption) and `cancel()` (immediate silence, REQ-LIFE-002). Because the OS
  default voice is often the most robotic one installed, the port SHOULD speak with the first
  installed voice from a short ranked preference list (e.g. `Google US English`, which ships with
  desktop Chrome) and use the system default only when none of them is installed.
- **Accept:** Given a fake `chrome.tts`, then `speak` resolves on the `end` event and `cancel` calls
  `chrome.tts.stop`; absent `chrome.tts`, `speechSynthesis` is used. Given an engine listing a
  preferred voice, then `speak` uses it; listing none of them, then no voice is set (system
  default).
- **Verify:** unit `tests/unit/speech-ports.test.js`; manual MT-03.

#### REQ-SPCH-002 — Speech-to-text listen cycles
- **Status:** Active · **Level:** MUST
- Speech input MUST use the Web Speech API (`SpeechRecognition`/`webkitSpeechRecognition`),
  one utterance per listen cycle, `maxAlternatives ≥ 3` (we use 5), interim results off, and
  deliver the full alternatives list (transcript + confidence) to the matcher (REQ-ANS-004).
  A cycle that ends with no result maps to `no-speech`.
- **Accept:** Given a fake recognizer emitting 3 alternatives, then all 3 reach the caller in order.
- **Verify:** unit `tests/unit/speech-ports.test.js`; manual MT-06.

#### REQ-SPCH-003 — Microphone permission denied
- **Status:** Active · **Level:** MUST
- On `not-allowed`/`service-not-allowed`, the session MUST explain by voice and in the panel how to
  grant mic access, then end. It MUST NOT retry-loop the permission prompt.
- **Accept:** Given a recognizer erroring `not-allowed`, then the mic-denied utterance is spoken and
  the session ends.
- **Verify:** unit `tests/unit/machine.test.js`, `tests/unit/speech-ports.test.js` (error mapping);
  manual MT-05.

#### REQ-SPCH-004 — Transient STT errors retry once
- **Status:** Active · **Level:** MUST
- `network` / `audio-capture` / `other` errors MUST be announced and retried once; a second
  consecutive failure ends the session with an explanation. `aborted` (our own cancellation) is
  silent.
- **Accept:** Given one network error then success, the session continues; given two, it ends.
- **Verify:** unit `tests/unit/machine.test.js`, `tests/unit/speech-ports.test.js`; manual MT-11.

#### REQ-SPCH-005 — Half-duplex discipline
- **Status:** Active · **Level:** MUST
- The mic MUST NOT be open while TTS is speaking (self-echo). LISTEN may only follow a completed
  SAY. (Barge-in is REQ-FUT-002.)
- **Accept:** Given any machine trace, then no LISTEN action is emitted between a SAY and its
  TTS_DONE.
- **Verify:** unit `tests/unit/machine.test.js` (action-order invariant checked across scenarios).

#### REQ-SPCH-006 — Question intonation passthrough
- **Status:** Active · **Level:** MUST
- Text handed to TTS MUST preserve terminal `?` so capable voices inflect (paired with the explicit
  announcement, REQ-READ-004).
- **Accept:** Given a `?` clue, then the TTS input string ends with `?`.
- **Verify:** unit `tests/unit/verbalizer.test.js`; manual MT-14.

#### REQ-SPCH-007 — Everything spoken is also shown
- **Status:** Active · **Level:** MUST
- Every utterance the system speaks MUST appear as a caption in the side panel (accessibility,
  debugging, and trust).
- **Accept:** Given a session, then panel captions mirror TTS output 1:1.
- **Verify:** manual MT-18.

#### REQ-SPCH-008 — What was heard is also shown
- **Status:** Active · **Level:** SHOULD
- The top transcript of each utterance SHOULD appear in the panel (`Heard: "plain"`), so
  recognition problems are visible.
- **Accept:** Given an utterance, then the panel shows the transcript.
- **Verify:** manual MT-18.

---

## 12. Page adapter (PAGE)

The only module allowed to know what the NYT DOM looks like. Because NYT can change their DOM at
any time, every selector lives in one file with a self-diagnosing probe.

#### REQ-PAGE-001 — Detect puzzle presence and solved state
- **Status:** Active · **Level:** MUST
- The adapter MUST classify the page as `active` (grid found, not solved), `solved`
  (success signal present — congratulations modal), or `not-found`.
- **Accept:** Given the fake page in each state, then the classification is correct.
- **Verify:** integration `tests/integration/page-adapter.test.js`; manual MT-01.

#### REQ-PAGE-002 — Grid snapshot
- **Status:** Active · **Level:** MUST
- The adapter MUST read: grid dimensions (derived from cell geometry, not hardcoded), and per cell:
  row/col, block flag, current letter (`''` when empty), and printed number (or null).
- **Accept:** Given the fake page, then the snapshot matches the fixture puzzle cell-for-cell.
- **Verify:** integration `tests/integration/page-adapter.test.js`; manual MT-01 (probe counts).

#### REQ-PAGE-003 — Clue snapshot with formatting preserved
- **Status:** Active · **Level:** MUST
- The adapter MUST read both clue lists (Across/Down) with: number, direction, and the clue's rich
  text as styled runs (`[{text, italic}]`) with entities decoded — enough to satisfy READ-002..007
  without re-touching the DOM.
- **Accept:** Given the fake page's italic clue, then its runs mark exactly the italic span.
- **Verify:** integration `tests/integration/page-adapter.test.js`; unit `tests/unit/clue-html.test.js`.

#### REQ-PAGE-004 — Read current selection
- **Status:** Active · **Level:** MUST
- The adapter MUST report which clue is currently selected on the page (and the selected cell), or
  nulls when indeterminate.
- **Accept:** Given the fake page with 1A selected, then selection reports 1A.
- **Verify:** integration `tests/integration/page-adapter.test.js`; manual MT-01.

#### REQ-PAGE-005 — Programmatic clue selection
- **Status:** Active · **Level:** MUST
- The adapter MUST be able to select a clue (click its entry in the clue list) such that the page
  highlights it — used by REQ-NAV-007.
- **Accept:** Given the fake page, when `selectClue('D3')` runs, then the page's selected clue is 3 Down.
- **Verify:** integration `tests/integration/page-adapter.test.js`; manual MT-02.

#### REQ-PAGE-006 — Enter a word
- **Status:** Active · **Level:** MUST
- The adapter MUST enter a word into an entry by simulating what a user does: focus each cell
  (click) and dispatch a keyboard event per letter. Per-cell addressing MUST be used (immune to
  NYT's "skip filled squares" setting). Overwriting an existing letter in a targeted cell is
  allowed (that is how NYT typing behaves).
- Risk note: synthetic events carry `isTrusted:false`; if the live page ignores them, fallbacks are
  documented in `docs/FEASIBILITY.md` §3 and MUST be validated early via MT-02.
- **Accept:** Given the fake page, when `enterAnswer` types HEART into 1A, then the five cells read
  H,E,A,R,T.
- **Verify:** integration `tests/integration/page-adapter.test.js`; manual MT-02.

#### REQ-PAGE-007 — Verify after write
- **Status:** Active · **Level:** MUST
- `enterAnswer` MUST re-read the cells afterwards and return `{ok, snapshot}`; `ok:false` when any
  cell disagrees (feeds REQ-ANS-013).
- **Accept:** Given a fake page rigged to drop keystrokes, then `ok:false` is returned.
- **Verify:** integration `tests/integration/page-adapter.test.js`.

#### REQ-PAGE-008 — Clear an entry
- **Status:** Active · **Level:** MUST
- The adapter MUST clear an entry (per-cell click + Backspace) — used by the replace flow before
  rewriting when letters must be removed rather than overwritten.
- **Accept:** Given a filled entry on the fake page, when `clearEntry` runs, then all its cells are
  empty (cells shared with *other* filled entries are still cleared — replace semantics are
  entry-scoped; crossings are the user's call via REQ-ANS-012/016).
- **Verify:** integration `tests/integration/page-adapter.test.js`.

#### REQ-PAGE-009 — Selector probe
- **Status:** Active · **Level:** MUST
- The adapter MUST ship a `probe()` that checks every selector/heuristic it relies on against the
  live DOM and returns a per-item ok/fail report (name, selector, match count). The panel MUST
  expose a "Probe page" button that displays the report. This is the first thing to run when NYT
  ships a redesign.
- **Accept:** Given the fake page, then all probe items report ok; given an empty page, then the
  probe reports failures rather than throwing.
- **Verify:** integration `tests/integration/page-adapter.test.js`; manual MT-01.

#### REQ-PAGE-010 — Change watching
- **Status:** Active · **Level:** MUST
- While a session runs, the adapter MUST watch the page (MutationObserver) and emit debounced
  events: `solved` (success modal appeared), `selection` (selected clue changed), `grid`
  (letters changed). Watching MUST start only on session start and stop on session end
  (REQ-NFR-004).
- **Accept:** Given the fake page, when the grid is completed correctly, then a `solved` event fires;
  when a different clue is clicked, a `selection` event fires.
- **Verify:** integration `tests/integration/page-adapter.test.js`; manual MT-13.

#### REQ-PAGE-011 — DOM knowledge is quarantined
- **Status:** Active · **Level:** MUST
- No module outside `extension/src/page-adapter/` (plus the fake-page fixture and its integration
  tests) may reference NYT DOM specifics (the `xwd__` class family). Enforced mechanically.
- **Accept:** Given the source tree, then a grep for `xwd__` outside the allowed paths finds nothing.
- **Verify:** unit `tests/unit/arch.test.js`.

---

## 13. Non-functional requirements (NFR) & future work (FUT)

#### REQ-NFR-001 — Fully client-side
- **Status:** Active · **Level:** MUST
- The extension MUST NOT require any first-party server: no fetch/XHR/WebSocket calls in extension
  source, no analytics, no remote config. All logic and data (homophone dictionary) ship in the
  package. *Caveat (documented, not code):* Chrome's cloud speech recognition may route audio
  through Google's speech service; see FEASIBILITY §2 for the on-device option.
- **Accept:** Given the source tree, then no network primitives appear in `extension/src`; given a
  live session, then DevTools shows no extension-originated requests.
- **Verify:** unit `tests/unit/arch.test.js`; manual MT-15.

#### REQ-NFR-002 — Privacy: nothing persisted
- **Status:** Active · **Level:** MUST
- No audio, transcripts, or puzzle content may be persisted (no `localStorage`, `indexedDB`,
  `chrome.storage` in MVP source). Transcripts live in panel memory and die with the session.
- **Accept:** Given the source tree, then no storage primitives appear; given a session end, then no
  extension storage exists.
- **Verify:** unit `tests/unit/arch.test.js`; manual MT-15.

#### REQ-NFR-003 — Latency budgets
- **Status:** Active · **Level:** SHOULD
- Icon click → first spoken word: ≤ 1.5 s (warm page). Utterance end → verdict speech start: ≤ 1.5 s.
  Entering a 5-letter word: ≤ 1.5 s.
- **Accept:** Stopwatch on a live page meets the budgets in 4 of 5 tries.
- **Verify:** manual MT-10.

#### REQ-NFR-004 — Inert when off
- **Status:** Active · **Level:** MUST
- With no session, the extension MUST NOT affect the page: the content script only registers a
  message listener (no DOM reads/writes, no observers) until a session command arrives.
- **Accept:** Given the extension installed and no session, then normal play is unaffected and no
  observers run.
- **Verify:** manual MT-21 (+ code structure: watcher starts on demand, REQ-PAGE-010).

#### REQ-NFR-005 — Language
- **Status:** Active · **Level:** MUST
- MVP is English: STT locale defaults to `en-US`; all phrasing is centralized in one module
  (`phrases.js`) so localization is a data change later.
- **Accept:** Given the STT port with no overrides, then its recognizer is configured `en-US`.
- **Verify:** unit `tests/unit/speech-ports.test.js`.

#### REQ-NFR-006 — Traceability is enforced
- **Status:** Active · **Level:** MUST
- `npm run verify` MUST fail if any Active requirement lacks test coverage, if any test references
  an unknown requirement ID, or if a manual test covers an unknown ID. (This is the executable-
  requirements mechanism auditing itself.)
- **Accept:** Given the repo, then `npm run verify` passes; given a fabricated REQ ID in a test, then
  `npm run trace` fails.
- **Verify:** manual MT-22 (run the pipeline and observe).

#### Future (Planned — tracked, not enforced)

- **REQ-FUT-001 — Rebus squares.** Cells holding multiple letters break the length arithmetic
  (REQ-READ-008, REQ-ANS-005). Plan: detect rebus candidates, announce the caveat, allow spelling
  mode with per-cell grouping. Until then: length = cell count, and a rebus puzzle may be
  unsolvable by voice.
- **REQ-FUT-002 — Barge-in.** Let the user interrupt TTS by speaking (requires echo-safe ducking or
  push-to-talk). Today: half-duplex (REQ-SPCH-005).
- **REQ-FUT-003 — Check/Reveal integration.** Drive NYT's own Check Square/Word features to turn
  REQ-LIFE-006 ("full but wrong") into targeted help.
- **REQ-FUT-004 — Follow cross-references.** "Go there" after `See 17-Across` (REQ-READ-010).
- **REQ-FUT-005 — Multi-tab sessions.** Today: single session (REQ-LIFE-009).
- **REQ-FUT-006 — On-device STT preference.** Surface Chrome's on-device recognition
  (`processLocally`) as a privacy setting when available.
- **REQ-FUT-007 — Settings UI.** Voice, rate, verbosity (e.g. REQ-READ-004 announcement),
  strategy default. Requires `chrome.storage` and revisiting REQ-NFR-002's blanket ban.

---

## 14. Executable requirements schema

The contract that makes this document testable:

1. **IDs.** Every requirement is a `####` heading matching `REQ-[A-Z]+-\d{3}`, with a
   `**Status:** Active|Planned` line. IDs are permanent; superseded requirements keep their ID and
   get `Status: Planned` (or a strikethrough note), never deletion.
2. **Coverage.** An Active requirement is *covered* when its ID appears in an automated test title
   (or comment) under `tests/`, or in a `Covers:` line in `docs/MANUAL-TESTS.md`. The `Verify:`
   line in each requirement records the intended mapping for humans; the tool checks the actual one.
3. **Enforcement.** `npm run trace` (tools/trace.mjs):
   - parses this file for requirement IDs + status;
   - scans `tests/**/*.test.js` and `docs/MANUAL-TESTS.md` for ID mentions;
   - **fails** on: Active requirement with zero mentions; any mention of an ID not defined here;
     malformed requirement blocks.
   - prints the coverage matrix (requirement → tests/manual items).
4. **Human assertion.** Automated: `npm test` (every test title carries the REQ IDs it proves).
   Manual: each MT item in `docs/MANUAL-TESTS.md` is a numbered script a human can run in minutes
   with a binary pass/fail expectation. `npm run verify` = tests + trace.
5. **Change discipline.** Behavior changes start in this file (edit the requirement), then tests,
   then code — the tool keeps the three honest in both directions.
