import intentPhrasesUnique from './intent-phrases-unique.mjs';

// voice-dialog — turning what a speech recognizer heard into an intent or a piece
// of content, and turning the app's answer back into something worth listening to.
// The lexicon of surface phrases, the normalization every match runs on, what to
// do with an n-best list, when to ask instead of guess, and how much to say.
//
// Every rule here judges the design of a spoken interface and holds for any app
// with one — a voice assistant, an IVR, a dictation surface, an accessibility
// mode — and the check's scan is repo-shape agnostic (see lib.mjs `isSource`) so
// it cannot pass vacuously green somewhere laid out differently. It lives locally
// only because the mounted canon has no home for this facet: the canon packs
// cover MV3 mechanics (chrome-extension), release (chrome-extension-release),
// node, github-actions, tidy-repo, and the spec/requirements discipline
// (spec-driven-product, executable-requirements) — none of them says anything
// about speech at all.
//
// The two sibling local packs bound it on either side: `browser-speech` owns the
// speech APIs themselves (the recognizer's lifecycle, mic capture, TTS delivery,
// error taxonomies) and `host-page-adaptation` owns the page the answers are typed
// into. This pack owns what happens between them — the language layer, which is
// pure and knows about neither. Declared by hand as `local/voice-dialog` in
// .claudinite-checks.json.
export default {
  id: 'voice-dialog',
  ruleRoutingGuidance: {
    belongs: 'designing a spoken dialog — intent lexicons, transcript normalization, n-best candidates, ambiguity, what the app says back',
    excludes: 'the speech APIs and mic themselves — local/browser-speech; driving the page the answer lands in — local/host-page-adaptation',
  },
  marker: null,
  detect: null,
  prose: 'RULES.md',
  worldRules: [
    intentPhrasesUnique,
  ],
};
