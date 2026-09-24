## 2026-08-07 · born · never trust a write, and synthetic keystrokes carry real-event fields (#130)
- **Source:** the weekly growth-discover-packs run (#120, logged on #77), distilled from
  `extension/src/page-adapter/`, the REQ-PAGE and REQ-LIFE families, the arch test, `selectors.js`'s
  dated verification notes and the fake-nyt fixture.
- **Reason:** MT-02 (the answer-injection go/no-go test) found a bare `{key}` KeyboardEvent reaching
  nytimes.com with `keyCode`/`which` 0, which the live handler branched on - recorded in
  `page-adapter/writer.js`.
- **Actor:** the growth-discover-packs run; merged by @missingbulb (owner).
- **Model:** Claude Sonnet 5, per the commit trailer.
- **Mechanism:** two prose sections in `local/host-page-adaptation`'s RULES.md.
- **Rejected:** a `synthetic-key-events-legacy-fields` check, cut at review: the repo builds its key
  init in one helper and spreads it, a shape a spread-silent check can never read.
- **Retire when:** a re-verification shows the live handler reads `key`/`code` rather than the
  legacy fields.
- **Landed:** #130, in `local/host-page-adaptation`.

## 2026-08-30 · converted · the document/body dispatch half became a check (#346)
- **Source:** the prose-to-checks sweep (#340).
- **Actor:** the prose-to-checks sweep; merged by @missingbulb (owner).
- **Mechanism:** the `synthetic-input-events-target-app-node` check; the covered sentence was
  deleted from the prose.
- **Landed:** #346.

## 2026-09-07 · moved · reduced to the repo's residue in local/crossword-chat (#407)
- **Source:** the fleet-wide consolidation to one local pack per repo, named for the repo
  (missingbulb/Claudinite#1691, here #396), once canon published `host-page` and a widened
  `web-speech`.
- **Reason:** the general judgment was canon's now; what stays is only what is true of this repo and
  this host.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 5, per the commit trailer.
- **Mechanism:** a RULES.md rule in `local/crossword-chat`, triggered on "Writing into the grid",
  folding the write and keystroke sections into one pointer; the general rules and the dispatch
  check are canon `host-page`'s.
- **Landed:** #407 (Closes #396).
