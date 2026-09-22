
// Conventions for a Node/npm project. Fingerprint: a package.json at the repo
// root or one directory down, never deeper.
const hasMarkerNearRoot = (ctx, marker) =>
  ctx.tracked.some((f) => {
    const parts = f.split('/');
    return parts[parts.length - 1] === marker && parts.length <= 2;
  });

export default {
  version: '60922.1',
  minEngineVersion: '60822.1',
  ruleRoutingGuidance: {
    belongs: 'conventions for a Node/npm project — module resolution, ESM vs CJS, dependency justification, jsdom test divergences',
    excludes: 'browser-runtime API behaviour — that is html or web-speech; Python packaging is python',
  },
  marker: 'package.json (at the repo root or one directory down)',
  detect: (ctx) => hasMarkerNearRoot(ctx, 'package.json'),
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
