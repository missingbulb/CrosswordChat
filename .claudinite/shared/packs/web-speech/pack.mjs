// The browser voice-I/O pack: speech-to-text (webkitSpeechRecognition / the Web
// Speech SpeechRecognition API) and text-to-speech (chrome.tts / speechSynthesis)
// runtime gotchas that apply whenever an app reads or listens through the browser.
// Mostly prose, with the call-site contracts in worldRules/, the web-speech-io
// skill's rules and the voice-cache declaration beside this file as checks.
// Fingerprinted by an actual speech-API reference in JS/TS source.

export default {
  version: '60927.2',
  minEngineVersion: '60927.1',
  ruleRoutingGuidance: {
    belongs: 'browser voice I/O gotchas — SpeechRecognition results and errors, speechSynthesis and chrome.tts, mic permission and lifecycle',
    excludes: 'general MV3 service-worker and content-script mechanics — that is chrome-extension; page markup is html',
  },
  pitch: 'Browser speech recognition and text-to-speech are full of undocumented behaviour, and this pack keeps Claude Code sessions ahead of it. Some fifteen rules cover microphones left open, listen cycles that settle twice, an empty voice list that only means not ready yet, recognition audio streamed to the cloud, and speak calls that never resolve. Several checks read the actual call sites and block those mistakes at every commit, and the web-speech-io skill guides wiring voice input and output, including in browser extensions.',
  relevanceDetector: {
    about: 'a browser speech API (SpeechRecognition / speechSynthesis / chrome.tts) referenced in JS/TS source',
    paths: /\.(mjs|cjs|js|jsx|ts|tsx)$/,
    text: /\b(webkitSpeechRecognition|SpeechRecognition|SpeechRecognitionPhrase|speechSynthesis|SpeechSynthesisUtterance|chrome\.tts)\b/,
    search: ['SpeechRecognition', 'webkitSpeechRecognition', 'SpeechRecognitionPhrase', 'speechSynthesis', 'SpeechSynthesisUtterance', 'tts'],
  },
};
