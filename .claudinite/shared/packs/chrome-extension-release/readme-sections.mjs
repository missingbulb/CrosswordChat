import { patternRule } from '../../engine/checks/helpers/pattern-rules.mjs';

export default patternRule({
  id: 'cer/readme-sections',
  severity: 'blocking',
  description: 'The README carries the standard Install and Releasing sections',
  doc: 'packs/chrome-extension-release/RELEASE.md',
  why: 'every extension repo documents install and release the same way, from the standard template',
  files: 'README.md',
  missing: {
    what: 'missing',
    fix: 'add a README with the standard Install and Releasing sections',
  },
  file: [
    {
      require: /^##\s+Install\b/m,
      what: 'missing the standard "## Install" section',
      fix: 'copy it from the README template in the release standard and fill in the repo values',
    },
    {
      require: /^##\s+Releasing\b/m,
      what: 'missing the standard "## Releasing" section',
      fix: 'copy it from the README template in the release standard and fill in the repo values',
    },
  ],
});
