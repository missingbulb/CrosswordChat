# web-speech pack

Active when a browser speech API — `webkitSpeechRecognition` / `SpeechRecognition`, `speechSynthesis` / `SpeechSynthesisUtterance`, or `chrome.tts` — is referenced in JS/TS source. Portable runtime gotchas for browser voice I/O (speech-to-text and text-to-speech).

Most gotchas are runtime browser behaviours with no repo-state signature a static check could read, so they live as prose (`RULES.md`). Nine call-site contracts **do** have a file-scoped signature — three in the [`web-speech-io`](skills/web-speech-io/SKILL.md) skill's bundle and six pack-level — and run as checks at every Stop and in CI; each failure message is the rule.

Some of these APIs are extension-only, and where a rule touches MV3 service-worker or content-script mechanics this pack owns the speech-API facet of it specifically — never the general extension gotcha underneath.

## Rules (`RULES.md`)

| Rule | Severity | Reason | Enforcement |
|---|---|---|---|
| The recognizer owns its microphone capture | high | correctness | prose: 99 words + skill check (`web-speech-capture-released-on-pagehide`) |
| Read the whole n-best list | medium | correctness | prose: 34 words |
| Settle the listen cycle exactly once | high | correctness | prose: 42 words + check (`stt-terminal-handlers`) |
| A missing isFinal means final | high | correctness | prose: 35 words |
| Classic recognition streams to the cloud | critical | legal | prose: 74 words |
| Biasing works only on-device | medium | correctness | prose: 71 words |
| Map error names to a small taxonomy | medium | complexity | prose: 48 words + check (`stt-error-map-has-default`) |
| Guard your own spoken output | high | correctness | prose: 66 words + check (`mic-constraints-not-screen-capture`) |
| A missed endpoint needs a pause watchdog | high | correctness | prose: 82 words |
| Mic permission is per-origin | high | correctness | prose: 120 words + check (`mic-capture-released`) |
| Prefer chrome.tts over speechSynthesis | medium | correctness | prose: 58 words |
| Relay chrome.tts from a content script | high | correctness | prose: 66 words + skill check (`web-speech-no-window-api-in-service-worker`) |
| An empty getVoices() means not-ready | high | correctness | prose: 44 words |
| Don't trust the default voice | low | correctness | prose: 74 words |
| Never reject a speak() promise | high | correctness | prose: 46 words + check (`tts-speak-settles`) |
| Neither engine reliably supports SSML | low | correctness | prose: 37 words |

## Provenance

Distilled from `missingbulb/CrosswordChat` — a Chrome extension that solves the NYT crossword conversationally (voice in, voice out). Grounded in its `extension/src/speech/` ports (`stt-port.js`, `tts-port.js`, `remote-tts-port.js`, `biasing.js`), the service-worker TTS relay (`extension/src/background/service-worker.js`), and its `dev/docs/FEASIBILITY.md` speech-API analysis.

## Checks

The first three ride the [`web-speech-io`](skills/web-speech-io/SKILL.md) skill's bundle, and
judge whether the APIs are reachable and released where the code runs. The six below them are
pack-level and judge the API *contracts* themselves — read at the call site, comments stripped
first, and parsed rather than grepped so the legitimate spellings stay quiet: a wrapper that
delegates its terminal handling, a constraints object hoisted into a constant, a switch that
dispatches side effects rather than mapping a value.

| Check | Severity | Reason | Enforcement |
|---|---|---|---|
| `web-speech-no-window-api-in-service-worker` | high | correctness | check: blocking |
| `web-speech-capture-released-on-pagehide` | critical | correctness | check: blocking |
| `web-speech-recognition-feature-detected` | medium | correctness | check: advisory |
| `mic-capture-released` | critical | correctness | check: blocking |
| `mic-constraints-not-screen-capture` | high | correctness | check: blocking |
| `stt-error-map-has-default` | high | correctness | check: blocking |
| `stt-interim-results-gated` | high | correctness | check: blocking |
| `stt-terminal-handlers` | high | correctness | check: blocking |
| `tts-speak-settles` | high | correctness | check: blocking |

What unites all six is that their breach is **silent**: nothing throws, nothing logs, and the
app keeps showing a live session while the user is heard by nobody, or hears nothing. That is
what earns them a scan rather than prose.
