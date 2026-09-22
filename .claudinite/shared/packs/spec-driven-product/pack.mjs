// A project-CLASS pack: the playbook for building and shipping a small end-user
// product against an executable spec. Prose only, and declared rather than
// detected.
export default {
  version: '60922.2',
  minEngineVersion: '60822.1',
  ruleRoutingGuidance: {
    belongs: 'playbook for shipping a small end-user product from an executable spec — leaf claims, owner-owned expecteds, green-main releases',
    excludes: 'the requirements file format and coverage gates — that is executable-requirements; research wikis are product-wiki',
  },
  // The product playbook runs its spec as tests — it leans on the framework
  // mechanics the executable-requirements pack carries.
  requires: ['executable-requirements'],
};
