import { finding } from '../../engine/checks/helpers/findings.mjs';
import { findExtensionManifest } from '../../engine/checks/helpers/chrome-manifest.mjs';
import { requestedPermissions } from './lib/manifest-permissions.mjs';

// Fires only on a permission THIS change adds: the store's per-permission
// justification lives on the dashboard, off-repo and manual, so the proactive
// tracking issue beats the reactive publish failure — and with no in-repo
// artifact to clear a block against, advisory is the honest severity.
// Permission SETS are compared against the base, not the text diff: appending a
// JSON array element re-touches the prior element's line (trailing comma).
const rule = {
  id: 'cer/permission-added-store-issue',
  severity: 'advisory',
  description: 'A permission added to the manifest needs a manual store-dashboard justification — open a tracking issue',
  doc: 'packs/chrome-extension-release/RELEASE.md',
  scope: 'work',
  why: 'the store requires a written justification per permission and blocks publishing the new version until the dashboard carries it; that step is manual, so a proactive issue beats the reactive publish failure',

  run(work) {
    const manifestPath = findExtensionManifest(work);
    if (!manifestPath) return [];
    const { head, base } = work.jsonPair(manifestPath);
    if (!head) return [];
    const baseSet = new Set(base ? requestedPermissions(base) : []);
    return requestedPermissions(head)
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
