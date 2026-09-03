// A project-CLASS pack (prose-only, no fingerprint): a product project of this
// class declares it. No detect — declaration is authoritative. The general
// test-trust rules the playbook leans on (see-it-fail, snapshot hygiene,
// re-baselining approval) stay in the writing-tests skill; release mechanics
// stay in the platform's release surface (e.g. the chrome-extension pack's).
export default {
  version: '60902.1',
  minEngineVersion: '60822.1',
  ruleRoutingGuidance: {
    belongs: 'playbook for shipping a small end-user product from an executable spec — leaf claims, owner-owned expecteds, green-main releases',
    excludes: 'the requirements file format and coverage gates — that is executable-requirements; research wikis are product-wiki',
  },
  // The product playbook runs its spec as tests — it leans on the framework
  // mechanics the executable-requirements pack carries.
  requires: ['executable-requirements'],
};
