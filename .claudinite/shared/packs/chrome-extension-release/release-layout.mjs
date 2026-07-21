import { finding } from '../../engine/checks/helpers/findings.mjs';

// The privacy policy is the one release artifact that must live in the repo: it
// is deployed verbatim as the public /privacy/ page the store listing points
// at. The release procedure itself is not duplicated per-repo — it lives once
// in RELEASE.md — and the listing copy / per-permission justifications are
// Chrome Web Store dashboard state, not files (see RELEASE.md).
const REQUIRED = [
  'dev/build/release/store_artifacts/PRIVACY.md',
];

const rule = {
  id: 'cer/release-layout',
  severity: 'blocking',
  description: 'The privacy policy source lives at the standard store_artifacts path',
  doc: 'packs/chrome-extension-release/RELEASE.md',
  why: 'the privacy page deploys from PRIVACY.md, and the store listing points at that live URL',

  run(ctx) {
    return REQUIRED.filter((p) => !ctx.exists(p)).map((p) =>
      finding(rule, {
        file: p,
        what: `required release artifact ${p} is missing`,
        fix: 'create it per the layout in the release standard (adapt from the reference repo)',
      })
    );
  },
};

export default rule;
