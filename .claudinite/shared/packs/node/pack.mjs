
// Conventions for a Node/npm project. Fingerprint: a package.json at the repo
// root or one directory down, never deeper.
export default {
  version: '60927.2',
  minEngineVersion: '60927.1',
  ruleRoutingGuidance: {
    belongs: 'conventions for a Node/npm project — module resolution, ESM vs CJS, dependency justification, jsdom test divergences',
    excludes: 'browser-runtime API behaviour — that is html or web-speech; Python packaging is python',
  },
  pitch: 'Keeps Claude Code sessions in a Node.js repo clear of the quiet failures that pass locally and break later. Several rules cover named imports from CommonJS packages that silently come back undefined, scripts that truncate their own output by calling process.exit, CI pinning an older Node than the sandbox, and jsdom behaving unlike a real browser. A few checks flag needless dependencies and text mangled by btoa, and the node-test-discovery skill plus a blocking check stop a test command that finds zero tests and still reports green.',
  relevanceDetector: { about: 'package.json (at the repo root or one directory down)', paths: /^([^/]+\/)?package\.json$/ },
  // `dirs` is the member's own value, from the node pack entry's `config` in
  // .claudinite-settings.json; unset means the repo root. A cloud setup script
  // starts in the checkout's PARENT, so env.mjs runs these from the checkout
  // and the `cd "$d"` is relative to it.
  env: {
    label: 'Node dependencies (npm ci)',
    setup: (p) =>
      (p.dirs?.length ? p.dirs : ['.'])
        .map((d) => `( cd "${d}" && npm ci ) || true`)
        .join('\n'),
    probe: (p) =>
      (p.dirs?.length ? p.dirs : ['.'])
        .map((d) => `[ -d "${d}/node_modules" ]`)
        .join(' && '),
  },
};
