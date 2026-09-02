// store-release's own precondition term: an unreleased manifest bump. It compares
// two facts nothing else in the vocabulary knows about each other — the shipped
// manifest version and the latest published release tag — so it lives beside the
// declaration that names it.

// Tags and manifest versions are compared modulo a leading `v`.
const norm = (v) => String(v ?? '').replace(/^v/, '').trim();

export const terms = {
  'manifest-ahead': {
    signals: ['release'],
    holds(signals) {
      const rel = signals.release ?? {};
      const shipped = norm(rel.manifestVersion);
      const released = norm(rel.latestTag);
      if (shipped === '') return { holds: false, reason: 'no manifest version could be read to compare against the latest release' };
      if (shipped === released) return { holds: false, reason: `manifest ${shipped} matches the latest release` };
      return {
        holds: true,
        reason: released ? `manifest ${shipped} is ahead of released ${released}` : `manifest ${shipped}, and nothing released yet`,
      };
    },
  },
};
