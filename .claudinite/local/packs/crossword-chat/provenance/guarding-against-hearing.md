## 2026-07-28 · born · self-echo is an application problem, in local/browser-speech (#78)
- **Source:** the weekly growth-discover-packs run (#72, logged on #77), distilled from
  `extension/src/speech/`, `dev/docs/ARCHITECTURE.md` and `dev/docs/SESSION-LOG.md`.
- **Reason:** decision D11 (`dev/docs/ARCHITECTURE.md` §7): `webkitSpeechRecognition` owns an
  unconstrainable capture, and Chrome's default AEC misses `chrome.tts`'s OS-rendered output, so the
  string-match guard (REQ-SPCH-005) is the design.
- **Actor:** the growth-discover-packs run; merged by @missingbulb (owner).
- **Mechanism:** a prose section ("Self-echo is an application problem, not a constraints problem")
  in `local/browser-speech`'s RULES.md.
- **Retire when:** the Web Speech API gains a stream/constraints hook, or TTS output moves to an
  in-browser playout Chrome's AEC can cancel.
- **Landed:** #78, in `local/browser-speech`.

## 2026-09-07 · moved · browser-speech deleted; merged with the pause window into one crossword-chat rule (#407)
- **Source:** the fleet-wide consolidation to one local pack per repo, named for the repo
  (missingbulb/Claudinite#1691, here #396), once canon published `host-page` and a widened
  `web-speech`.
- **Reason:** the general judgment was canon's now; what stays is only what is true of this repo and
  this host.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 5, per the commit trailer.
- **Mechanism:** a RULES.md rule in `local/crossword-chat`, triggered on "Tuning the speech
  windows", carrying the measured 1.8 s pause window beside the echo pointer; the general echo rule
  is canon `web-speech`'s.
- **Landed:** #407 (Closes #396).

## 2026-09-13 · reworded · pause-window half dropped, trigger now names the echo (#422)
- **Source:** the growth-dedup run (#418) against canon `host-page` and `web-speech`, both of which
  changed in the window.
- **Reason:** canon `web-speech` now states the same 1.2 s / 1.8 s figures, so only the pointer to
  REQ-SPCH-005 is this repo's.
- **Actor:** the growth-dedup run; merged by automation.
- **Landed:** #422.
