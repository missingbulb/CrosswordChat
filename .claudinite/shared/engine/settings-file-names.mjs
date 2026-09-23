// WHAT A MEMBER'S SETTINGS FILE IS CALLED - the name alone, and nothing that
// touches a disk to find one.
//
// The name is split out from `settings-file.mjs` because one reader has no disk:
// the dashboard page runs this module in a browser, unbundled, and a single
// `node:` import anywhere in its graph fails the page's first module load
// (#1286). So the two halves live apart — the vocabulary here, the `existsSync`
// probe beside it - and `settings-file.mjs` re-exports everything below, which
// keeps it the one import every disk-side reader needs.
//
// THE RENAME (#1252) IS DONE (#1640). The file is `.claudinite-settings.json`. It
// was `.claudinite-checks.json` when checks were the only thing a member declared;
// the old name was read everywhere until the convergence window the advisory
// (`legacy-shape-in-use`) opened had passed, and nothing reads it now.

export const SETTINGS_FILE = '.claudinite-settings.json';

// The settings-file names, as a list. One element, and nothing in this tree reads
// it: a fielded pack version imports it BY NAME, and the engine lane reaches a
// member ahead of the pack lane, so deleting it would fault that pack at link time
// and the failed self-test would refuse the converge that carries the fix. It comes
// out when no fielded pack version names it any more (#1911).
export const SETTINGS_FILES = [SETTINGS_FILE];

// Is this path the settings file? For the scans that ask whether a changed file is
// the declaration. Derived from the list above rather than comparing the one name
// directly, so there is a single statement of what the settings file is called -
// and so this export's own line does not change when the list loses an entry.
export const isSettingsFile = (path) => SETTINGS_FILES.includes(String(path ?? '').split('/').pop());
