import pageObserversDisconnected from './page-observers-disconnected.mjs';
import syntheticInputEventsBubble from './synthetic-input-events-bubble.mjs';

// host-page-adaptation — being a guest in a web app you do not own: reading its
// DOM, driving it with synthetic input, watching it change, and injecting your
// own UI into it, all against markup that can be redesigned without notice.
//
// Every rule here judges a DOM/API contract that holds for any code driving a
// third-party page — a userscript, a browser automation layer, an extension's
// content script — and its scan is repo-shape agnostic (see lib.mjs `isSource`)
// so it cannot pass vacuously green somewhere laid out differently. It lives
// locally only because the mounted canon has no home for this facet: the
// chrome-extension pack covers MV3 manifest/permission/content-script MECHANICS
// (how to get your code onto the page) and says nothing about what to do once it
// is there, and node / github-actions / chrome-extension-release /
// spec-driven-product / executable-requirements are orthogonal. Declared by hand
// as `local/host-page-adaptation` in .claudinite-settings.json.
export default {
  id: 'host-page-adaptation',
  ruleRoutingGuidance: {
    belongs: 'driving a host web app you don\'t own — its DOM, synthetic input, change watching, injected UI',
    excludes: 'how extension code reaches the page (manifest, permissions, registration) — chrome-extension; speech APIs — local/browser-speech',
  },
  marker: null,
  detect: null,
  prose: 'RULES.md',
  worldRules: [
    pageObserversDisconnected,
    syntheticInputEventsBubble,
  ],
};
