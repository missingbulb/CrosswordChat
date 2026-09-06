// crossword-chat — this repo's own instances of rules the canon states in
// general. The judgment lives in the canon packs this repo declares (`host-page`
// for guesting in nytimes.com's app, `web-speech` for the voice surfaces); what
// is here is only what is true of CrosswordChat and of no other repo: the token
// the arch test enforces, the host behaviours measured against this puzzle, and
// the files and REQ ids a session has to be pointed at. Declared by hand as
// `local/crossword-chat` in .claudinite-settings.json.
export default {
  id: 'crossword-chat',
  ruleRoutingGuidance: {
    belongs: 'CrosswordChat\'s own instances — its adapter paths, NYT-measured behaviours, fixture and REQ ids',
    excludes: 'anything true of another repo — host-page, web-speech and chrome-extension own the general rules',
  },
  marker: null,
  detect: null,
  prose: 'RULES.md',
};
