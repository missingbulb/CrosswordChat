// WHERE A MEMBER'S SETTINGS LIVE — the one import for every reader in the corpus
// that has a disk: the checks loader, the update and install flows, the vendor
// writer, the migration ops, and the cross-repo readers that fetch the file over
// the API rather than off disk.
//
// The name itself lives in `settings-file-names.mjs`, which stays free of `node:`
// imports so the dashboard page can load it in a browser. It is re-exported here,
// so nothing on the disk side has to know about the split.
import { join } from 'node:path';
import { SETTINGS_FILE } from './settings-file-names.mjs';

export { SETTINGS_FILE, SETTINGS_FILES, isSettingsFile } from './settings-file-names.mjs';

// The settings file under `root`. Returned whether or not it exists, so a caller
// reporting "no settings file" names the file a member should have.
export function settingsPath(root) {
  return join(root, SETTINGS_FILE);
}
