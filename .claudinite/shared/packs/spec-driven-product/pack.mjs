// A project-CLASS pack: the playbook for building and shipping a small end-user
// product against an executable spec. Prose only, and declared rather than
// detected.
export default {
  version: '60927.1',
  minEngineVersion: '60925.1',
  ruleRoutingGuidance: {
    belongs: 'playbook for shipping a small end-user product from an executable spec — leaf claims, owner-owned expecteds, green-main releases',
    excludes: 'the requirements file format and coverage gates — that is executable-requirements; research wikis are product-wiki',
  },
  pitch: 'Suits a small end-user product built against an executable spec. About two dozen rules teach Claude Code sessions to keep one numbered requirements document where every requirement carries a stable id and is proven by exactly one test, enforced by a coverage gate. Documentation comes first and tests start red, expected results stay the owner\'s approval record, gaps the test harness cannot reach are marked where they live, and releases happen automatically whenever main is green. Nothing ships unexplained, and no requirement quietly loses its proof.',
  // The product playbook runs its spec as tests — it leans on the framework
  // mechanics the executable-requirements pack carries.
  requires: ['executable-requirements'],
};
