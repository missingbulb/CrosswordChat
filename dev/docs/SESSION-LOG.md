# Session-log format (`CWC1`) — how to read a diagnostics dump

The "Send session data" dialog (REQ-DIAG-001/002) exports voice sessions in a compact
format built for one constraint: the prefilled GitHub-issue link holds ~6000 URL-encoded
characters, and an analyst needs the *whole* run in it — every heard transcript in plain
text, everything else as short codes. The formatter is
`extension/src/shared/session-log.js`; a drift-guard in
`extension-test/unit/session-log.test.js` keeps the example below byte-equal to its real
output, so this file never lies.

## Layout

```
CWC1 v<version> <puzzle>          ← run context: format tag, extension version, puzzle path tail

S1 <header>                       ← one block per session, oldest first
<event>!<event>!<event>...        ← one line of events, separated by '!'

S2 <header>
...
```

**Session header** — `S1 mf 1.4 bf eg od1 aec1 (10)`, in order:

| Field | Meaning |
|---|---|
| `mf` / `lo` | strategy: most-filled / list-order |
| `1.4` | TTS rate |
| `b?` | biasing mode, first letter: `bo`ff `bc`ommands `bs`pelling `bf`ull |
| `e?` | echo mode: `eg`uard `en`ative |
| `od1`/`od0` | on-device biasing engaged / unavailable (only present when biasing is on) |
| `aec1`/`aec0` | echo cancellation engaged on the mic preflight (absent = unknown) |
| `(10)` | logged events in this session |

## Events

Each event is `[Δs]<body>` — integer seconds since the previous event, omitted when 0.
After a trim marker, the first Δ counts from the (dropped) previous event.

| Body | Meaning |
|---|---|
| `>5A.4` | read clue 5-Across, entry length 4 (clue text is on the puzzle page, not logged) |
| `h alt~69*alt~42` | heard n-best: plain-text transcripts, `~NN` = confidence 0–99 (omitted when 0). Tag variants: `hb` barge-in; mode letter `hs` spelling, `hd` disambiguating, `hg` goto-number |
| `+` / `+lama` | accepted, "Fits!"; the word appears only when written differently than heard |
| `++` / `++lama` | accepted over a fully filled entry, "Override!" (REQ-ANS-016); the word appears only when written differently than heard |
| `L7.8n4` | length mismatch: candidate lengths 7 and 8, entry needs 4 (`o2` suffix = "or 2 for the open squares") |
| `x3` / `x3.2` | collision at letter 3 (+2 more clashes) |
| `a2` | ambiguous between 2 spellings |
| `?` / `?g` | didn't catch / didn't catch a go-to label |
| `Hf.nn` | hint readout: current pattern, `.` = open square |
| `sp2.4` / `sl fin` | spelling started (2 open of 4) / buffer so far |
| `G` `W` `B` `N` | grid full but wrong · win · goodbye · background-noise hint (REQ-SPCH-012) |
| `(kind)` | any other spoken line, by its say kind |
| `e?` | STT error: `en`o-speech `er`eset `ea`borted `ed`enied `ew`network `ec`apture `eo`ther |
| `t 5A f.nn` | letters appeared WITHOUT us writing them — the user typed into 5-Across; `t *6` = 6 cells changed across entries (reveal/check) |
| `z reason` | session ended: `user`, `goodbye`, `silence`, `win`, `nyt-pause`, `page-lost`, `worker-lost`, `mic-denied`, `stt-error`, `no-puzzle`, `already-solved` |

**Trim markers** (REQ-DIAG-001): when the issue link runs out of budget, older sessions
collapse to `(N events omitted)` first; the newest session then loses events from its
head — `(N earlier events omitted)!...` — so its ending always survives. "Copy log" always
has the full text.

## Worked example

<!-- session-log-example:begin — held byte-equal to formatSessions() by session-log.test.js -->
````
```
CWC1 v0.13.5 mini

S1 mf 1.4 bf eg od1 aec1 (10)
>1A.4!6h next~69!>2D.3!5h med~65*mad~39!+!4en!3h new york~20!L7.8n4!11t 1A finn!4z user
```
````
<!-- session-log-example:end -->

Read: session 1, most-filled, rate 1.4, full biasing that DID engage on-device, AEC on.
Clue 1-Across (4 letters) → 6s later "next" (conf .69) → clue 2-Down (3) → 5s later
"med"/"mad" → accepted. 4s of silence, then "new york" (conf .20) got a length-mismatch
reply (7 or 8 letters, need 4). 11s later the user *typed* FINN into 1-Across themselves —
recognition failed them — and 4s later stopped the session.

## What to look for

- **`er` storms** — 3+ consecutive resets = continuous background talk the recognizer
  can't finalize (issue #43 session 2). The `N` hint should appear once after the third.
- **`t` after misses** — a `t` event following `L`/`?` turns on the same entry is the
  "voice failed, user typed it" signature; the transcripts before it show what STT heard
  instead. The strongest recognition-failure evidence a log can carry.
- **`od0` with `bf`** — the biasing experiment was configured but never engaged
  (no on-device model); recognition data from that session says nothing about biasing.
- **Command misfires** — a command word (`next`, `undo`) inside `h` alternatives that was
  answered with `?` or `L`, or an answer accepted when a command was meant.
- **Self-echo** — `h` transcripts that repeat our own phrasing right after a said event
  (e.g. fragments of a clue immediately after `>`); should not happen (REQ-SPCH-005).
- **Session-end context** — `z silence` after long `en` runs is normal; `z user` seconds
  after repeated failures is frustration; `z nyt-pause` means NYT idled us out.
