// crossword-chat - this repo's own instances of rules the canon states in
// general: the adapter paths, the host behaviours measured on nytimes.com, and
// the files and REQ ids a session has to be pointed at.
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
