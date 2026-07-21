import { finding } from '../../engine/checks/helpers/findings.mjs';

const rule = {
  id: 'cer/readme-sections',
  severity: 'blocking',
  description: 'The README carries the standard Install and Releasing sections',
  doc: 'packs/chrome-extension-release/RELEASE.md',
  why: 'every extension repo documents install and release the same way, from the standard template',

  run(ctx) {
    const readme = ctx.read('README.md');
    if (readme === null) {
      return [finding(rule, {
        file: 'README.md', what: 'missing',
        fix: 'add a README with the standard Install and Releasing sections',
      })];
    }
    const out = [];
    for (const section of ['Install', 'Releasing']) {
      if (!new RegExp(`^##\\s+${section}\\b`, 'm').test(readme)) {
        out.push(finding(rule, {
          file: 'README.md',
          what: `missing the standard "## ${section}" section`,
          fix: 'copy it from the README template in the release standard and fill in the repo values',
        }));
      }
    }
    return out;
  },
};

export default rule;
