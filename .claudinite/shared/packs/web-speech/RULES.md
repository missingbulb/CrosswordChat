# Web Speech APIs

> Some of these APIs (`chrome.tts`) are extension-only; where a rule touches
> MV3 service-worker / content-script mechanics, only the speech-API facet is
> here — the general extension gotcha underneath is not.

## Speech-to-text (`webkitSpeechRecognition` / Web Speech API)

- **The recognizer owns its own microphone capture — you cannot hand it
  `getUserMedia` audio constraints.** `echoCancellation` / `noiseSuppression` /
  `autoGainControl` are `getUserMedia` *microphone* constraints, and the recognizer
  exposes no hook to set them on its internal stream (Chrome applies its default
  echo cancellation there regardless). To *warm* the device with a known processing
  state — and to read back whether echo cancellation actually engaged — run a
  separate preflight `getUserMedia({ audio: {…} })` capture and stop its tracks.
  (`suppressLocalAudioPlayback` /
  `restrictOwnAudio` are `getDisplayMedia` *screen-capture* constraints and have no
  bearing on a mic — don't reach for them here.)
- **Read the whole n-best list, not just alternative `[0]`.** Set
  `maxAlternatives` > 1 and iterate `result[0..length]` for `{ transcript,
  confidence }`; the ranked alternatives are exactly where homophone / near-miss
  recovery lives. (1)
- **Guard a `settled` flag so a listen cycle settles exactly once.** Interim
  results arrive before the final one, a cycle can end with no result at all
  (treat `onend`-without-result as `no-speech`), and an error and an end can
  both arrive. (2)
- **With `interimResults` off, engines omit `isFinal` — treat a result as final
  unless `isFinal === false`.** Don't test `if (result.isFinal)` (it's `undefined`
  on those engines and you'll drop every result); test `result.isFinal !== false`.
- **The classic recognizer streams audio to a cloud service (Google's) — plan for
  it.** A `network` error means "offline / service unreachable", and audio leaves
  the machine. On-device recognition is opt-in and capability-gated: probe
  `SpeechRecognition.available({ langs, processLocally: true }) === 'available'`
  once and cache it, set `recognizer.processLocally = true`, and **never trigger a
  language-pack download** (only `'available'` counts, not `'downloadable'`). When
  the local path is absent, fall back to ordinary cloud recognition unchanged.
- **Contextual biasing (`SpeechRecognitionPhrase` + `recognizer.phrases`) works
  only on the on-device path** — gate it behind that same availability probe and
  apply it best-effort (any failure falls back to un-biased recognition rather than
  breaking the listen cycle). Only bias **closed vocabularies you control**
  (a command lexicon, known labels, a spelling alphabet) with **modest** boosts:
  over-boosting makes the recognizer hear a biased phrase when the user actually
  said a same-sounding free-form utterance.
- **Map the raw Web Speech error names to a small taxonomy** — `not-allowed` /
  `service-not-allowed` → permission-denied, plus `no-speech`, `network`,
  `aborted`, `audio-capture`, else `other`. In particular `aborted` is the
  *self-inflicted* stop (you called `recognizer.abort()`), so the caller should
  ignore it rather than surface it as a failure.
- **Hearing your own spoken output come back as a transcript — fix it in the application, not
  at the capture layer.** Chrome's default echo cancellation is a loopback of *page* playout,
  so it attenuates `speechSynthesis` and misses `chrome.tts` entirely, whose audio the OS
  renders. Match the recognized text against what you just spoke and discard it; that guard is
  the design, not a stopgap. (3)
- **A missed endpoint mid-utterance needs a pause watchdog, not just `onend`.**
  If interim hypotheses exist but no final arrives, the engine may have lost the
  endpoint; a timer that fires after a pause discards the half-heard input and
  reopens a fresh cycle (preventing "heart heart" doubles when the user repeats
  themselves). Set the threshold **well above a natural mid-command thinking
  pause** — a tight window (~1.2 s) cuts real commands; a wider one (~1.8 s) keeps
  only the genuine missed-endpoint case.
- **Mic permission is per-origin, and the grant belongs to whatever page the
  recognizer runs in.** In a content script the prompt reads as the *host site*
  asking and the grant persists for that origin. Surface it in a controlled moment:
  preflight `navigator.permissions.query({ name: 'microphone' })`, then a one-time
  `getUserMedia` to raise the prompt. **Retry the capture bare** (`{ audio: true }`)
  if the first constrained call is rejected — a browser balking at the constraint
  *shape* must not be misread as a permission denial; only a second failure is a
  real "denied". Run that preflight **even when the permission is already granted** —
  skipping it leaves the device warmed, and echo cancellation confirmed, only on the very
  first grant.

## Text-to-speech (`chrome.tts` / `speechSynthesis`)

- **Prefer `chrome.tts` over `speechSynthesis` — it's immune to page
  autoplay / user-activation gating.** `speechSynthesis` invoked from a content
  script is subject to the host page's autoplay policy and can silently refuse to
  speak; `chrome.tts` (extension-only, needs the `"tts"` permission, usable from the
  service worker) is not. Make `chrome.tts` primary and `speechSynthesis` the
  fallback for non-extension document contexts.
- **`chrome.tts` doesn't exist in a content script — relay speak/cancel to the
  service worker over a port.** Keep the same `speak()`/`cancel()` contract on both
  sides; the in-page port sends `{ speak }` / `{ cancel }` messages and the worker
  drives `chrome.tts`. On port disconnect, resolve every pending `speak()` promise
  so a dead worker never leaves the caller awaiting an utterance that will never
  finish.
- **Voice lists load lazily — an empty `getVoices()` means "not ready yet", not
  "no voices".** Resolve the preferred voice on the *first* `speak()` and don't
  cache an empty result: fall back to the default that turn and try to resolve
  again next turn.
- **Don't trust the OS/browser default voice — it's often the most robotic one
  installed.** Keep an ordered list of preferred voice names, take the first one
  actually installed, and fall back to the default only when none match. Treat that order
  and the speaking rate as user-facing settings with a modest default rather than constants
  tuned once — they are taste, and taste is wrong often enough to be worth a control. (4)
- **Never reject a `speak()` promise — resolve it on every terminal event
  instead.** Resolving on error (not rejecting) keeps a spoken-prompt sequence
  from deadlocking on one bad utterance. Use `enqueue: false` so a new line
  interrupts the current one for turn-taking rather than stacking up.
- **Neither engine reliably supports SSML — you can't force intonation.** If a
  punctuation cue matters (a question's rising tone), speak the cue in words
  ("question mark") rather than relying on prosody the engine may not apply.
