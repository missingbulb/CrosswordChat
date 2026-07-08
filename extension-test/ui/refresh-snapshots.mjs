// Regenerate the committed UI goldens (extension-test/ui/cases/<name>.png) from
// the cases, using the SAME rendering the visual-snapshots test uses. Run after an
// intentional change to the shipped UI (brand-icon.js, session-button.js, or the
// toolbar fixture) and commit the PNGs so the before/after shows up in the PR diff.
//
//   npm run refresh:ui

import { writeFileSync } from 'node:fs';
import { loadCases, snapshotPath } from './cases.js';

const cases = await loadCases();
for (const testCase of cases) {
  const out = snapshotPath(testCase.name);
  writeFileSync(out, await testCase.render());
  console.log(`Wrote ${out}`);
}
console.log(`\nRegenerated ${cases.length} golden(s). Review the diff and commit the PNGs.`);
