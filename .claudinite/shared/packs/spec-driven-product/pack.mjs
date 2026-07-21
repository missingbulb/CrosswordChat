// A project-CLASS pack (prose-only, no fingerprint): a product project of this
// class declares it. No detect — declaration is authoritative. The general
// test-trust rules the playbook leans on (see-it-fail, snapshot hygiene,
// re-baselining approval) stay in the writing-tests skill; release mechanics
// stay in the platform's release pack (e.g. chrome-extension-release).
export default {
  id: 'spec-driven-product',
  marker: null,
  detect: null,
  // The product playbook runs its spec as tests — it leans on the framework
  // mechanics the executable-requirements pack carries.
  requires: ['executable-requirements'],
  prose: 'RULES.md',
  rules: [],
};
