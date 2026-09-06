// Technology pack: being a guest in a web app you do not own — reading its DOM,
// driving it with synthetic input, watching it change, and injecting your own UI
// into it, all against markup that can be redesigned without notice.
//
// The sibling of web-scraping, from the other side of the glass: that pack
// acquires data from a site you don't own by fetching it, this one operates one
// from inside its own page. chrome-extension covers how your code REACHES the
// page (manifest, permissions, content-script registration) and says nothing
// about what to do once it is there; headless-browser drives a browser you own
// from outside it.
//
// Declared by hand. There is no honest fingerprint: the shapes that would
// suggest the pack — a content script, a `dispatchEvent`, a `MutationObserver` —
// are equally the shapes of code running on its own page, and a marker that
// cannot tell a guest from a host would suspect the pack in every DOM repo in
// the fleet.
export default {
  version: '60904.1',
  minEngineVersion: '60822.1',
  ruleRoutingGuidance: {
    belongs: 'driving a web app you do not own — its DOM, synthetic input, change watching, injected UI',
    excludes: 'how your code reaches the page — chrome-extension; fetching a site\'s data — web-scraping',
  },
  // Three checks, each on a contract whose breach is SILENT — an observer that
  // outlives its feature, an event that does not bubble, an event aimed outside
  // the app root. All three leave `dispatchEvent` returning true and the page
  // simply not responding, which is why they are worth a scan rather than prose:
  // the reader cannot tell them apart from "the app ignores untrusted events".
  // Everything else in RULES.md stays prose — judgment about a host you cannot
  // see from here.
};
