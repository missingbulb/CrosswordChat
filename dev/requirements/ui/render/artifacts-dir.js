// Where the visual test writes <name>.actual.png / <name>.diff.png when a golden
// comparison fails — a single gitignored dir separate from the committed goldens,
// so adding cases never adds ignore entries. Kept in-repo (not the system temp
// dir) so CI can collect the diffs as build artifacts; failure messages print the
// full path.

import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

export const ARTIFACTS_DIR = join(dirname(fileURLToPath(import.meta.url)), '.artifacts');

export function artifactPath(name) {
  mkdirSync(ARTIFACTS_DIR, { recursive: true });
  return join(ARTIFACTS_DIR, name);
}
