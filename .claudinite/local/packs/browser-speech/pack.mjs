import ttsSpeakSettles from './tts-speak-settles.mjs';
import sttTerminalHandlers from './stt-terminal-handlers.mjs';
import micCaptureReleased from './mic-capture-released.mjs';
import micConstraintsNotScreenCapture from './mic-constraints-not-screen-capture.mjs';
import sttErrorMapHasDefault from './stt-error-map-has-default.mjs';
import sttInterimResultsGated from './stt-interim-results-gated.mjs';

// browser-speech — driving the browser's speech APIs (SpeechRecognition /
// webkitSpeechRecognition, chrome.tts, speechSynthesis, and the getUserMedia
// capture behind them).
//
// Every rule here judges a browser API contract, not a product decision: it is
// written to hold in ANY voice-driven web app, and its scan is repo-shape
// agnostic (see lib.mjs `isSource`) so it cannot pass vacuously green somewhere
// laid out differently. It lives locally only because the mounted canon has no
// home for this facet yet — the chrome-extension pack covers MV3 build/runtime
// gotchas and says nothing about speech, and `node` / `github-actions` /
// `spec-driven-product` are orthogonal. Declared by hand as
// `local/browser-speech` in .claudinite-checks.json.
export default {
  id: 'browser-speech',
  ruleRoutingGuidance: {
    belongs: 'browser speech API contracts — SpeechRecognition, chrome.tts, speechSynthesis, and the getUserMedia capture behind them',
    excludes: 'MV3 build and runtime gotchas — those are chrome-extension',
  },
  marker: null,
  detect: null,
  prose: 'RULES.md',
  worldRules: [
    ttsSpeakSettles,
    sttTerminalHandlers,
    micCaptureReleased,
    micConstraintsNotScreenCapture,
    sttErrorMapHasDefault,
    sttInterimResultsGated,
  ],
};
