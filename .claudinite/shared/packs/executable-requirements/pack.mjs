import featureRequirementsFirst from './feature-requirements-first.mjs';

// The executable-requirements framework standard: the concrete, portable
// conventions — layout, naming, gates, kinds, gallery, determinism — shared by
// every project that runs its spec as tests. The judgment layer (owner-owned
// expecteds, doc-first discipline) is the spec-driven-product pack; this pack
// is the mechanics that implement it. Fingerprinted by the framework's one
// structural constant: the spec file itself.
export default {
  id: 'executable-requirements',
  marker: 'dev/requirements/requirements.md',
  detect: (ctx) => ctx.tracked.includes('dev/requirements/requirements.md'),
  prose: 'RULES.md',
  rules: [featureRequirementsFirst],
};
