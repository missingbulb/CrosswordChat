import { finding } from '../../engine/checks/helpers/findings.mjs';
import { findExtensionManifest } from '../../engine/checks/helpers/chrome-manifest.mjs';

const rule = {
  id: 'cer/version-sync',
  severity: 'blocking',
  description: "The manifest's version is the single source of truth; package.json must equal it",
  doc: 'packs/chrome-extension-release/RELEASE.md',
  why: 'a version that diverges ships the wrong number to the store or refuses to publish',

  run(ctx) {
    const manifestPath = findExtensionManifest(ctx);
    if (!manifestPath) return [];
    let manifest;
    try { manifest = JSON.parse(ctx.read(manifestPath)); } catch { return []; }
    const pkgText = ctx.read('package.json');
    if (pkgText === null) {
      return [finding(rule, {
        file: 'package.json',
        what: 'missing — the release pipeline builds via npm run build at the repo root',
        fix: 'add the root package.json with version equal to the manifest\'s',
      })];
    }
    let pkg;
    try { pkg = JSON.parse(pkgText); } catch { return []; }
    if (manifest.version !== pkg.version) {
      return [finding(rule, {
        file: manifestPath,
        what: `manifest version ${manifest.version} != package.json version ${pkg.version}`,
        fix: 'bump both together — "bump version" edits the manifest and package.json in the same change',
      })];
    }
    return [];
  },
};

export default rule;
