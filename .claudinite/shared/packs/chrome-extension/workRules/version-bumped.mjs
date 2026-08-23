import { finding } from '../../../engine/checks/helpers/findings.mjs';
import { BumpError, compare, nextVersion, readVersion } from '../stubs/actions/bump-extension-patch/bump.mjs';
import { parseConfig } from '../stubs/actions/read-release-config/read-config.mjs';
import { shipsReleasePipeline } from '../worldRules/release-workflows.mjs';

// THE VERSION BELONGS TO THE CHANGE. The release flow ships whatever version it
// finds on `main` and writes none of its own, so a change that alters a shipped
// file without raising the version has nowhere to land: create-package no-ops on
// a version that is already released, the daily run agrees with it, and the edit
// sits on `main` reaching no user. The store enforces the same thing from the
// other side — it rejects an upload whose version is not strictly higher than
// the live one — so a version that did not move is not a late bump, it is a
// release that never happens.
//
// It is also what a reviewer reads to know what the PR in front of them will
// ship as, which is only true while the two arrive together.
//
// The relevance test is the repo's OWN `ship_paths` — the same declaration the
// release config gives the pipeline — so a README, a test or a workflow edit is
// free, exactly as it is for the release trigger.
//
// WORK SCOPE: the tree always carries a version; only the diff says whether it
// moved with the shipped files beside it. The pack-side twin in Claudinite's own
// canon is `pack-version-bumped`, which holds the identical line for a pack
// directory.

export function shipPaths(cfg) {
  return (cfg.ship_paths ?? '').split(/\s+/).filter(Boolean);
}

// A ship path is a directory ("extension") or an exact file
// ("extension/manifest.json") — matched the way the release trigger matches it.
export function touchesShippedFiles(changed, roots) {
  return (changed ?? []).filter((f) => roots.some((r) => f === r || f.startsWith(`${r}/`)));
}

const rule = {
  id: 'cer/version-bumped',
  severity: 'blocking',
  scope: 'work',
  description: 'A change to a shipped file raises the extension version in the same change',
  doc: 'packs/chrome-extension/skills/chrome-store-releases/SKILL.md',
  why: 'the release flow ships the version it finds on main and never writes one, so a shipped change that does not raise the version is never released — create-package no-ops on a version that is already out, and the store rejects an upload that is not strictly higher',

  run(work) {
    if (!shipsReleasePipeline(work)) return [];
    const configText = work.read('.github/release.config');
    if (configText === null) return [];          // cer/release-config owns a missing config
    const { cfg } = parseConfig(configText);

    const roots = shipPaths(cfg);
    if (!roots.length) return [];
    const touched = touchesShippedFiles(work.changedFiles, roots);
    if (!touched.length) return [];

    const manifest = cfg.manifest_path;
    if (!manifest) return [];                    // cer/release-config's finding

    const headText = work.read(manifest);
    const baseText = work.readBase(manifest);
    if (headText === null || baseText === null) return [];  // the manifest arrives (or leaves) with this change
    let head;
    let base;
    try {
      head = readVersion(manifest, headText);
      base = readVersion(manifest, baseText);
      if (compare(head, base) > 0) return [];
    } catch (err) {
      // An off-scheme version is cer/version-sync's finding, and it has no place
      // in an ordering — say nothing here rather than twice.
      if (err instanceof BumpError) return [];
      throw err;
    }

    return [finding(rule, {
      file: manifest,
      what: head === base
        ? `this change edits a shipped file (${touched[0]}${touched.length > 1 ? `, +${touched.length - 1} more` : ''}) but leaves the version at ${head}`
        : `the extension version moves backwards, ${base} → ${head}`,
      fix: head === base
        ? `raise it to ${nextVersion(head)} in ${manifest} and package.json together — a minor or major is the release flow's bump dispatch, not a shipped change`
        : 'extension versions only ever increase — the store rejects an upload that is not strictly higher than the live one, so a lowered number can never ship',
    })];
  },
};

export default rule;
