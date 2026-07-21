import { finding } from '../../engine/checks/helpers/findings.mjs';
import { findExtensionManifest } from '../../engine/checks/helpers/chrome-manifest.mjs';
import { requestedPermissions } from './lib/manifest-permissions.mjs';

const PRIVACY = 'dev/build/release/store_artifacts/PRIVACY.md';

// Test the world: at all times, every permission the manifest requests must be
// disclosed in the privacy document — the one release artifact that stays in the
// repo (it is deployed verbatim as the public privacy policy). Whole-repo scope:
// it reads the current manifest and PRIVACY.md, not the diff, so drift in either
// direction surfaces regardless of what this change happened to touch.
const rule = {
  id: 'cer/privacy-permission-alignment',
  severity: 'blocking',
  description: 'Every manifest permission is disclosed in the privacy document',
  doc: 'packs/chrome-extension-release/RELEASE.md',
  why: 'the deployed privacy policy must disclose everything the extension can access; an undisclosed permission is a store-review and trust failure',

  run(ctx) {
    const manifestPath = findExtensionManifest(ctx);
    if (!manifestPath) return [];
    let manifest;
    try { manifest = JSON.parse(ctx.read(manifestPath)); } catch { return []; }
    const privacy = ctx.read(PRIVACY);
    if (privacy === null) return []; // cer/release-layout already flags the missing privacy doc
    return requestedPermissions(manifest)
      .filter((p) => !privacy.includes(p))
      .map((p) =>
        finding(rule, {
          file: PRIVACY,
          what: `manifest requests "${p}" but the privacy document does not mention it`,
          fix: `disclose what "${p}" accesses in PRIVACY.md, so the deployed privacy policy reflects what the extension can reach`,
        })
      );
  },
};

export default rule;
