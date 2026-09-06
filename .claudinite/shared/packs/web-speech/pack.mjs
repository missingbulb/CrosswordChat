// The browser voice-I/O pack: speech-to-text (webkitSpeechRecognition / the Web
// Speech SpeechRecognition API) and text-to-speech (chrome.tts / speechSynthesis)
// runtime gotchas that apply whenever an app reads or listens through the browser.
// Most rules stay prose — runtime browser behaviours, not repo-state signatures a
// static check could test — but two groups do have a static signature: the six
// call-site contracts in worldRules/ (mic release, mic constraints not confused
// with screen-capture ones, a total error-name mapping, an interim-results gate,
// the STT terminal-handler pair, and TTS promise settlement), and the
// web-speech-io skill's three rules (a Window-scoped speech API in the MV3
// service worker, a bare webkit-prefixed recognizer construction, and a mic
// capture the whole repo releases nowhere on pagehide). Fingerprinted by an
// actual speech-API reference in JS/TS source (the marker only *suspects* the
// pack; declaring it is the project's call, like every pack).
const SPEECH_API =
  /\b(webkitSpeechRecognition|SpeechRecognition|SpeechRecognitionPhrase|speechSynthesis|SpeechSynthesisUtterance|chrome\.tts)\b/;
const SOURCE = /\.(mjs|cjs|js|jsx|ts|tsx)$/;

export default {
  version: '60906.1',
  minEngineVersion: '60822.1',
  ruleRoutingGuidance: {
    belongs: 'browser voice I/O gotchas — SpeechRecognition results and errors, speechSynthesis and chrome.tts, mic permission and lifecycle',
    excludes: 'general MV3 service-worker and content-script mechanics — that is chrome-extension; page markup is html',
  },
  marker: 'a browser speech API (SpeechRecognition / speechSynthesis / chrome.tts) referenced in JS/TS source',
  detect: (ctx) =>
    ctx.tracked.some((f) => {
      if (!SOURCE.test(f)) return false;
      const text = ctx.read(f);
      return text !== null && SPEECH_API.test(text);
    }),
};
