
// The executable-requirements framework standard: the concrete, portable
// conventions — layout, naming, gates, kinds, gallery, determinism — shared by
// every project that runs its spec as tests. The judgment layer (owner-owned
// expecteds, doc-first discipline) is the spec-driven-product pack; this pack
// is the mechanics that implement it. Fingerprinted by the framework's one
// structural constant: the spec file itself.
export default {
  version: '60822.1',
  minEngineVersion: '60822.1',
  ruleRoutingGuidance: {
    belongs: 'running a numbered spec as tests: dev/requirements layout, requirement ids, kinds, coverage and gallery gates, determinism rules',
    excludes: 'doc-first judgment, owner-owned expecteds and honest-gap tracking — spec-driven-product; general test practice — basics writing-tests',
  },
  marker: 'dev/requirements/requirements.md',
  detect: (ctx) => ctx.tracked.includes('dev/requirements/requirements.md'),
  // Adoption interview: the spec runs AS tests, so two decisions must be made
  // before the first requirement is authored — how a UI requirement becomes an
  // assertion (the harness), and where the requirements come from (a new file,
  // or extracted from an existing doc / the issue tracker). `config.spec` fixes
  // the executable spec's home; the rest records as intent on the entry.
  questions: [
    {
      id: 'ui_testing',
      prompt: 'How are the executable UI requirements exercised — what is the UI-testing mechanism (browser/E2E such as Playwright, DOM-level golden rendering, a headless harness), or is there none yet? Most requirements should be verifiable by a short test that drives to a state and makes a VISUAL assertion (a committed golden the owner checks by sight), so this fixes how a requirement becomes that assertion.',
      distill: 'recorded as intent; it fixes the harness the requirements.md drives its UI gates through, and the visual-golden path most leaves take for simplest owner verification',
    },
    {
      id: 'requirements_source',
      prompt: 'Where do the requirements come from — an existing requirements/spec document, the issue tracker, or authored fresh? Name the path or source so the spec is seeded from it rather than reinvented.',
      distill: "record the source; set config.spec to the executable spec's home (default dev/requirements/requirements.md) and extract the initial requirements from the named source",
    },
  ],
};
