import ttsSpeakSettles from './tts-speak-settles.mjs';
import sttTerminalHandlers from './stt-terminal-handlers.mjs';
import micCaptureReleased from './mic-capture-released.mjs';

// browser-speech — CrosswordChat's local pack for driving the browser's speech
// APIs (webkitSpeechRecognition, chrome.tts, speechSynthesis, getUserMedia).
//
// A local pack because the mounted canon has no home for this facet: the
// chrome-extension pack covers MV3 build/runtime gotchas and says nothing about
// speech, and `node` / `github-actions` / `spec-driven-product` are orthogonal.
// Declared by hand as `local/browser-speech` in .claudinite-checks.json —
// `detect`/`marker` stay null, as a local pack is never fingerprinted or seeded.
export default {
  id: 'browser-speech',
  always: false,
  marker: null,
  detect: null,
  prose: 'RULES.md',
  rules: [ttsSpeakSettles, sttTerminalHandlers, micCaptureReleased],
};
