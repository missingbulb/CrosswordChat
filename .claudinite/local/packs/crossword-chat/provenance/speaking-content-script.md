## 2026-07-28 · born · the chrome.tts relay, in local/browser-speech (#78)
- **Source:** the weekly growth-discover-packs run (#72, logged on #77), distilled from
  `extension/src/speech/`, `dev/docs/ARCHITECTURE.md` and `dev/docs/SESSION-LOG.md`.
- **Reason:** decision D2 (`dev/docs/ARCHITECTURE.md` §7) chose `chrome.tts` as the primary output
  because it is immune to the page's autoplay policy, and the session lives in the page where
  `chrome.tts` is not exposed.
- **Actor:** the growth-discover-packs run; merged by @missingbulb (owner).
- **Mechanism:** a prose section ("Where each API can run") in `local/browser-speech`'s RULES.md.
- **Retire when:** `chrome.tts` stops being available to the extension, or page autoplay no longer
  gates unprompted `speechSynthesis` (D2's own revisit trigger: `chrome.tts` voice quality
  disappoints).
- **Landed:** #78, in `local/browser-speech`.

## 2026-09-07 · moved · browser-speech deleted; the relay's residue kept in local/crossword-chat (#407)
- **Source:** the fleet-wide consolidation to one local pack per repo, named for the repo
  (missingbulb/Claudinite#1691, here #396), once canon published `host-page` and a widened
  `web-speech`.
- **Reason:** the general judgment was canon's now; what stays is only what is true of this repo and
  this host.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 5, per the commit trailer.
- **Mechanism:** a RULES.md rule in `local/crossword-chat`, triggered on "Speaking from the content
  script"; the general `chrome.tts` rules are canon `web-speech`'s.
- **Landed:** #407 (Closes #396).
