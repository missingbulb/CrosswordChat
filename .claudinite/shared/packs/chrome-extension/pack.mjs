import { findExtensionManifest } from '../../engine/checks/helpers/chrome-manifest.mjs';

// Everything about a Chrome extension in one pack: the MV3 build/runtime gotchas
// that apply while you are writing one, and the Chrome-Web-Store release standard
// that applies once you publish it. Fingerprinted by the manifest, which is what a
// repo has from its first commit.
//
// THE RELEASE HALF IS GATED ON SHIPPING, not on a second declaration (#1057). It
// used to be its own opt-in pack, chrome-extension-release, whose `detect` was the
// orchestrator workflow's name — so the fact that decided whether the release rules
// applied was always structural, and the declaration was a second copy of it that a
// repo had to remember to write. Now that fact is read where it is used:
// `shipsReleasePipeline` gates the coded rule, and every declared check carries the
// same test as its `relevantWhen`. A repo that only codes an extension sees none of
// them; a repo that publishes gets them without anyone declaring anything.
//
// The `cer/` check ids are kept as they are. A member's `accept` entries name rules
// by id, and renaming one silently orphans an acceptance — the finding comes back
// with nothing to carry the member across. A prefix outliving the pack it was named
// for is the cheaper of those two.
// The release standard itself — the pipeline's contract, the setup for a new
// extension repo, and the store steps no automation can take — is skills/, not
// prose: it is long, and only the checks need to be eager.
export default {
  version: '60824.1',
  minEngineVersion: '60822.1',
  ruleRoutingGuidance: {
    belongs: 'writing and shipping a Chrome extension: MV3 service-worker, permission, content-script and auth gotchas, plus Web Store release, versioning and privacy',
    excludes: 'generic workflow lint rules — git-github; shipping to a different store — the app-store-release and play-store-release packs',
  },
  marker: 'a manifest.json declaring manifest_version',
  detect: (ctx) => findExtensionManifest(ctx) !== null,
  // Delivery, not state: the tree always carries a version, and only the diff
  // says whether it moved with the shipped files beside it.
  // Pack-contributed task: `tasks/store-release/` — the scheduler's filesystem scan
  // (packs/claudinite-tasks/discover.mjs) picks it up on any repo declaring this pack, so
  // its own precondition is what keeps it off a repo that does not publish.
};
