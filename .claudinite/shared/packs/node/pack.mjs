import earnEachDependency from './earn-each-dependency.mjs';

// Fingerprint: a package.json at the repo root OR one directory down (a
// monorepo's functions/ or server/ dir) — but never deeper, so a package.json
// in a nested fixture/example tree can't trip detection. (The jsdom gotchas in
// RULES.md stay prose — runtime divergence with no artifact signature.)
const hasMarkerNearRoot = (ctx, marker) =>
  ctx.tracked.some((f) => {
    const parts = f.split('/');
    return parts[parts.length - 1] === marker && parts.length <= 2;
  });

export default {
  id: 'node',
  marker: 'package.json (at the repo root or one directory down)',
  detect: (ctx) => hasMarkerNearRoot(ctx, 'package.json'),
  prose: 'RULES.md',
  rules: [earnEachDependency],
  // The Node runtime ships in the base image, but a repo's (often uncommitted,
  // devDependency) modules don't — so `npm test`/build would trigger a
  // confusing mid-session install. Install them at environment-image build. The
  // package.json location varies per repo, so it's a per-project param: set
  // `dirs` in the node pack entry's `config` in .claudinite-checks.json
  // (default: repo root). A
  // cloud setup script starts in the checkout's PARENT, so env.mjs runs this
  // from the checkout — the `cd "$d"` is relative to it.
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
