## 2026-08-07 · born · mirror the host in a fixture (#130)
- **Source:** the weekly growth-discover-packs run (#120, logged on #77), distilled from
  `extension/src/page-adapter/`, the REQ-PAGE and REQ-LIFE families, the arch test, `selectors.js`'s
  dated verification notes and the fake-nyt fixture.
- **Actor:** the growth-discover-packs run; merged by @missingbulb (owner).
- **Model:** Claude Sonnet 5, per the commit trailer.
- **Mechanism:** a prose section in `local/host-page-adaptation`'s RULES.md.
- **Landed:** #130, in `local/host-page-adaptation`.

## 2026-09-07 · moved · reduced to the repo's residue in local/crossword-chat (#407)
- **Source:** the fleet-wide consolidation to one local pack per repo, named for the repo
  (missingbulb/Claudinite#1691, here #396), once canon published `host-page` and a widened
  `web-speech`.
- **Reason:** the general judgment was canon's now; what stays is only what is true of this repo and
  this host.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 5, per the commit trailer.
- **Mechanism:** a RULES.md rule in `local/crossword-chat`, triggered on "Rehearsing the
  read/write/watch cycle".
- **Landed:** #407 (Closes #396).

## 2026-09-13 · reworded · stripped to the fixture commands and the manual-test doc (#422)
- **Source:** the growth-dedup run (#418) against canon `host-page` and `web-speech`, both of which
  changed in the window.
- **Reason:** canon `host-page`'s "Testing the read/write/watch cycle" rule now states the fixture's
  limit near verbatim.
- **Actor:** the growth-dedup run; merged by automation.
- **Landed:** #422.
