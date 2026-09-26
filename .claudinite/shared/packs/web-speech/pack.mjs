// The browser voice-I/O pack: speech-to-text (webkitSpeechRecognition / the Web
// Speech SpeechRecognition API) and text-to-speech (chrome.tts / speechSynthesis)
// runtime gotchas that apply whenever an app reads or listens through the browser.
// Mostly prose, with the call-site contracts in worldRules/, the web-speech-io
// skill's rules and the voice-cache declaration beside this file as checks.
// Fingerprinted by an actual speech-API reference in JS/TS source.
const SPEECH_API =
  /\b(webkitSpeechRecognition|SpeechRecognition|SpeechRecognitionPhrase|speechSynthesis|SpeechSynthesisUtterance|chrome\.tts)\b/;
const SOURCE = /\.(mjs|cjs|js|jsx|ts|tsx)$/;

export default {
  version: '60925.1',
  minEngineVersion: '60925.1',
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
