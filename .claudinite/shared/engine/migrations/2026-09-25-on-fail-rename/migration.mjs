// A check says what it does when it fails: `severity: "blocking" | "advisory"` is
// `on_fail: "block" | "advise"`, and a settings override takes "off" | "advise" |
// "block". The op is the registry's `renameOnFail`, a named codemod over the
// member's own settings and local packs; the vendored mount moves with its own
// update. The engine keeps reading the old spelling for one convergence window,
// with `legacy-shape-in-use` naming whatever this record could not reach.
//
// appliesTo reads the member's mount for the engine that reads `on_fail`: an older
// one throws on a declared check with no `severity`, so a rewrite ahead of it would
// fail every check run the member has. An unreadable mount reads as not capable.
const FINDINGS = 'engine/checks/helpers/findings.mjs';
const readsOnFail = async (read) => {
  const text = (await read(`.claudinite/shared/${FINDINGS}`)) ?? (await read(FINDINGS));
  return Boolean(text) && text.includes('LEGACY_ON_FAIL');
};

export default {
  id: 'on-fail-rename',
  landed: '2026-09-25',
  version: '60925.1',
  summary: 'a check\'s `severity: blocking|advisory` is respelled `on_fail: block|advise` in the member\'s settings overrides and local packs (the old spelling still read, and advised on, for one window)',
  appliesTo: readsOnFail,
  renameOnFail: true,
  legacyPresent: async (exists) => exists('.claudinite/local/packs') || exists('.claudinite-settings.json'),
};
