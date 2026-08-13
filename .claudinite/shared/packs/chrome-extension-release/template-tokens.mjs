import { patternRule } from '../../engine/checks/helpers/pattern-rules.mjs';
import { WORKFLOW_FILE } from '../../engine/checks/helpers/github-workflows.mjs';

export default patternRule({
  id: 'cer/template-tokens',
  severity: 'blocking',
  description: 'No __TOKEN__ placeholder may survive in the release workflows',
  doc: 'packs/chrome-extension-release/RELEASE.md',
  why: 'the setup contract says: grep for __ afterwards; no token may survive',
  files: WORKFLOW_FILE,
  over: 'tracked',
  line: [{
    match: /__[A-Z_]+__/,
    what: 'unreplaced template token {match}',
    fix: 'replace it with this repo\'s value (zip name, bump command, …) per the setup steps',
  }],
});
