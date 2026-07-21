import { finding } from '../../engine/checks/helpers/findings.mjs';
import { findExtensionManifest } from '../../engine/checks/helpers/chrome-manifest.mjs';
import { requestedPermissions } from './lib/manifest-permissions.mjs';

// Test the work: when *this change* adds a permission to the manifest, the store
// needs a written justification for it on the Privacy-practices tab before the
// next publish can ship — and that dashboard step cannot be automated. So this
// fires only on the added permission (diff vs the merge-base), prompting the
// session to open the tracking issue while it is the one making the change.
//
// Advisory, not blocking: the fix lives entirely off-repo (the dashboard), so
// there is no in-repo artifact to clear a block against — and reintroducing one
// (a per-permission justification file or acceptance) is exactly the drift this
// standard removed. The proactive issue beats the reactive publish failure.
const rule = {
  id: 'cer/permission-added-store-issue',
  severity: 'advisory',
  description: 'A permission added to the manifest needs a manual store-dashboard justification — open a tracking issue',
  doc: 'packs/chrome-extension-release/RELEASE.md',
  why: 'the store requires a written justification per permission and blocks publishing the new version until the dashboard carries it; that step is manual, so a proactive issue beats the reactive publish failure',

  run(ctx) {
    const manifestPath = findExtensionManifest(ctx);
    if (!manifestPath) return [];
    let manifest;
    try { manifest = JSON.parse(ctx.read(manifestPath)); } catch { return []; }
    // Compare permission *sets* against the base, not the text diff: appending a
    // JSON array element re-touches the prior element's line (trailing comma), so
    // a line-based "added" test would over-report the permission before it.
    let basePerms = [];
    const baseText = ctx.readBase(manifestPath);
    if (baseText !== null) {
      try { basePerms = requestedPermissions(JSON.parse(baseText)); } catch { basePerms = []; }
    }
    const baseSet = new Set(basePerms);
    return requestedPermissions(manifest)
      .filter((p) => !baseSet.has(p))
      .map((p) =>
        finding(rule, {
          file: manifestPath,
          what: `this change adds the "${p}" permission`,
          fix: `open a tracking issue for the manual Chrome Web Store dashboard step: the Privacy-practices tab needs a written justification for "${p}" before the next publish (daily or manual) can ship — it cannot be automated`,
        })
      );
  },
};

export default rule;
