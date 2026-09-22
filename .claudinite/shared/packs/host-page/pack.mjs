// Technology pack: being a guest in a web app you do not own — reading its DOM,
// driving it with synthetic input, watching it change, and injecting your own UI
// into it, all against markup that can be redesigned without notice.
//
// Declared by hand; it carries no fingerprint.
export default {
  version: '60921.1',
  minEngineVersion: '60822.1',
  ruleRoutingGuidance: {
    belongs: 'driving a web app you do not own — its DOM, synthetic input, change watching, injected UI',
    excludes: 'how your code reaches the page — chrome-extension; fetching a site\'s data — web-scraping',
  },
};
