import { workflowFiles } from '../../engine/checks/helpers/github-workflows.mjs';
import releaseWorkflows, { STUB_NAME, LEGACY_STUB_NAMES, LEGACY_CREATE_PACKAGE, VENDORED_CREATE_PACKAGE } from './release-workflows.mjs';
import templateTokens from './template-tokens.mjs';
import releaseConfig from './release-config.mjs';
import versionSync from './version-sync.mjs';
import releaseLayout from './release-layout.mjs';
import privacyPermissionAlignment from './privacy-permission-alignment.mjs';
import permissionAddedStoreIssue from './permission-added-store-issue.mjs';
import readmeSections from './readme-sections.mjs';
import storeRelease from './run_daily/store-release.mjs';

// A repo "ships the release pipeline" once it carries the orchestrator — a
// workflow named "Release to Chrome Store" that wires the create-package reusable
// — the fingerprint DESIGN.md pins the conformance suite to. A manifest alone
// never trips this, so coding an extension doesn't drag in the release checks;
// opting in — declaring the pack, then vendoring the release set (orchestrator +
// reusable workflows + composite actions), PRIVACY.md and the first-publication
// issue — does. Both halves matter: the orchestrator name is the consumer marker
// (Claudinite's OWN core workflows are named "Chrome extension: … (reusable)", so
// the name check keeps the canon repo from self-matching), and the create-package
// wiring proves it's a live pipeline. Either wiring form counts — the pre-
// vendoring canon call @main, or the vendored local file — so a consumer mid-
// migration (or fully vendored) both fingerprint. Legacy stub names still
// fingerprint, so a repo whose orchestrator predates a rename keeps its
// declaration honest while cer/release-workflows flags the stale name.
const STUB_NAMES = new Set([STUB_NAME, ...LEGACY_STUB_NAMES]);

function shipsReleasePipeline(ctx) {
  return workflowFiles(ctx).some((wf) => {
    const text = ctx.read(wf);
    if (text === null) return false;
    const name = /^name:\s*['"]?(.+?)['"]?\s*$/m.exec(text)?.[1];
    if (!STUB_NAMES.has(name)) return false;
    // Wires create-package either way: the pre-vendoring canon call @main, or the
    // vendored local file.
    return text.includes(`/.github/workflows/${LEGACY_CREATE_PACKAGE}@`) ||
      text.includes(`/Claudinite/.github/workflows/${LEGACY_CREATE_PACKAGE}`) ||
      text.includes(`./.github/workflows/${VENDORED_CREATE_PACKAGE}`);
  });
}

export default {
  id: 'chrome-extension-release',
  marker: 'the "Release to Chrome Store" orchestrator (wires the vendored reusable workflows + composite actions)',
  detect: shipsReleasePipeline,
  // The release standard builds on the coding pack — shipping presumes the MV3
  // rules that produced the extension.
  requires: ['chrome-extension'],
  // RELEASE.md is the on-demand reference (linked from the coding pack's RULES
  // and from findings), not always-on prose: it is long, and only the checks
  // need to be eager.
  prose: null,
  rules: [
    releaseWorkflows,
    templateTokens,
    releaseConfig,
    versionSync,
    releaseLayout,
    privacyPermissionAlignment,
    permissionAddedStoreIssue,
    readmeSections,
  ],
  // Pack-contributed run_daily task: the fleet plan picks this up only on repos that
  // declare chrome-extension-release. See run_daily/store-release.mjs.
  run_daily: [storeRelease],
};
