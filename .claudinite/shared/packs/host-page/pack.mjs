// Technology pack: being a guest in a web app you do not own — reading its DOM,
// driving it with synthetic input, watching it change, and injecting your own UI
// into it, all against markup that can be redesigned without notice.
//
// Declared by hand; it carries no fingerprint.
export default {
  version: '60927.1',
  minEngineVersion: '60925.1',
  ruleRoutingGuidance: {
    belongs: 'driving a web app you do not own — its DOM, synthetic input, change watching, injected UI',
    excludes: 'how your code reaches the page — chrome-extension; fetching a site\'s data — web-scraping',
  },
  pitch: 'Code that runs inside a web app it does not own, such as a browser extension or userscript, breaks the moment the host redesigns its markup, often without throwing. This pack gives Claude Code sessions about a dozen rules for quarantining host DOM knowledge in one module, identifying host UI robustly, verifying every write by re-reading it, sending realistic synthetic input, and staying inert when switched off. A few checks catch observers left connected and synthetic keystrokes missing the fields host pages still read.',
};
