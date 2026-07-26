import { findExtensionManifest } from '../../engine/checks/helpers/chrome-manifest.mjs';
import declarativeContentSetIcon from './declarative-content-set-icon.mjs';

// The coding pack: MV3 build/runtime gotchas that apply whenever you are writing
// an extension, fingerprinted by the manifest. Release and Chrome-Web-Store
// publication are a separate, opt-in concern — the chrome-extension-release pack
// (its RELEASE.md and conformance checks), declared when the project is ready to
// ship. Most of the pack's gotchas are runtime-shaped and stay prose; the ones
// with a static signature in the source convert to checks here.
export default {
  id: 'chrome-extension',
  marker: 'a manifest.json declaring manifest_version',
  detect: (ctx) => findExtensionManifest(ctx) !== null,
  prose: 'RULES.md',
  rules: [declarativeContentSetIcon],
};
