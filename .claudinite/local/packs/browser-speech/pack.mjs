import ttsSpeakSettles from './tts-speak-settles.mjs';
import sttTerminalHandlers from './stt-terminal-handlers.mjs';
import micCaptureReleased from './mic-capture-released.mjs';

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
  always: false,
  marker: null,
  detect: null,
  prose: 'RULES.md',
  rules: [ttsSpeakSettles, sttTerminalHandlers, micCaptureReleased],
};
