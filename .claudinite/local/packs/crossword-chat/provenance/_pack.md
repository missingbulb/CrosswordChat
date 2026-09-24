## 2026-08-07 · born · local/host-page-adaptation (#130)
- **Source:** the weekly growth-discover-packs run (#120, logged on #77), distilled from
  `extension/src/page-adapter/`, the REQ-PAGE and REQ-LIFE families, the arch test, `selectors.js`'s
  dated verification notes and the fake-nyt fixture.
- **Reason:** driving a third-party page from inside it was the one facet the product is built on
  that no canon pack homed; `chrome-extension` covers how code reaches the page, not what to do
  there.
- **Actor:** the growth-discover-packs run; merged by @missingbulb (owner).
- **Model:** Claude Sonnet 5, per the commit trailer.
- **Mechanism:** a local pack manifest, declared by hand in `.claudinite-settings.json`.
- **Rejected:** declaring a canon pack instead - none owned the facet.
- **Landed:** #130, in `local/host-page-adaptation`.

## 2026-09-07 · moved · host-page-adaptation renamed crossword-chat, browser-speech deleted (#407)
- **Source:** the fleet-wide consolidation to one local pack per repo, named for the repo
  (missingbulb/Claudinite#1691, here #396), once canon published `host-page` and a widened
  `web-speech`.
- **Reason:** the general judgment was canon's now; what stays is only what is true of this repo and
  this host.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 5, per the commit trailer.
- **Mechanism:** a local pack manifest declared by hand as `local/crossword-chat`, with no
  fingerprint; routing guidance points the general rules at `host-page`, `web-speech` and
  `chrome-extension`.
- **Rejected:** keeping checks here - all three went to canon `host-page`, and the one repo-specific
  scan (`xwd__`) is the project's own `extension-test/unit/arch.test.js`; keeping an empty
  `references.md` - every rule cites the file, REQ or MT that records it.
- **Landed:** #407 (Closes #396).
