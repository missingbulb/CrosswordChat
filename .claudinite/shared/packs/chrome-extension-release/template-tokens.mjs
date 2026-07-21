import { finding } from '../../engine/checks/helpers/findings.mjs';
import { workflowFiles } from '../../engine/checks/helpers/github-workflows.mjs';

const rule = {
  id: 'cer/template-tokens',
  severity: 'blocking',
  description: 'No __TOKEN__ placeholder may survive in the release workflows',
  doc: 'packs/chrome-extension-release/RELEASE.md',
  why: 'the setup contract says: grep for __ afterwards; no token may survive',

  run(ctx) {
    const out = [];
    for (const wf of workflowFiles(ctx)) {
      const text = ctx.read(wf);
      if (text === null) continue;
      text.split('\n').forEach((line, i) => {
        const m = /__[A-Z_]+__/.exec(line);
        if (m) {
          out.push(finding(rule, {
            file: wf, line: i + 1,
            what: `unreplaced template token ${m[0]}`,
            fix: 'replace it with this repo\'s value (zip name, bump command, …) per the setup steps',
          }));
        }
      });
    }
    return out;
  },
};

export default rule;
