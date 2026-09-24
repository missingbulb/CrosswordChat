## 2026-08-07 · born · be inert when you are off (#130)
- **Source:** the weekly growth-discover-packs run (#120, logged on #77), distilled from
  `extension/src/page-adapter/`, the REQ-PAGE and REQ-LIFE families, the arch test, `selectors.js`'s
  dated verification notes and the fake-nyt fixture.
- **Actor:** the growth-discover-packs run; merged by @missingbulb (owner).
- **Model:** Claude Sonnet 5, per the commit trailer.
- **Mechanism:** a prose section in `local/host-page-adaptation`'s RULES.md; its observer teardown
  is the `page-observers-disconnected` check.
- **Landed:** #130, in `local/host-page-adaptation`.

## 2026-09-07 · moved · reduced to the repo's residue in local/crossword-chat (#407)
- **Source:** the fleet-wide consolidation to one local pack per repo, named for the repo
  (missingbulb/Claudinite#1691, here #396), once canon published `host-page` and a widened
  `web-speech`.
- **Reason:** the general judgment was canon's now; what stays is only what is true of this repo and
  this host.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 5, per the commit trailer.
- **Mechanism:** a RULES.md rule in `local/crossword-chat`, triggered on "Adding anything at load
  time"; the general inertness rule and its observer check are canon `host-page`'s.
- **Landed:** #407 (Closes #396).
