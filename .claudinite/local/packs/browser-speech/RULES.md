# Browser speech — the judgment core

Driving the browser's speech surfaces (`SpeechRecognition` / `webkitSpeechRecognition`,
`chrome.tts`, `speechSynthesis`, the mic capture behind them). The mechanical rules — completion
handlers, mic release, which constraints a mic capture may even ask for, whether an error mapping
is total, and whether interim hypotheses are gated before delivery — are this pack's six checks;
what follows is only what no check can decide for you.

Each rule below is a judgment about the API, and holds for any voice-driven app. Where one cites
this repo — a file, a decision record, a measured number — that is the **evidence** it was drawn
from, not the scope it applies to; a rule grounded in a real instance beats one asserted in the
abstract. The measured values (the pause window especially) are this product's and should be
re-measured elsewhere, not copied.

The one thing to keep in mind everywhere below: **speech failures are silent**. Nothing throws,
nothing logs, the UI keeps showing a live session — the user just hears nothing, or is heard by
nobody. Design each of these surfaces so every path produces exactly one observable outcome.

## Where each API can run

- `chrome.tts` is **not exposed to content scripts**. The session lives in the page (speech
  recognition needs a document, and the mic grant belongs to nytimes.com), so speaking is a
  relay: the content script sends `cc:speak` over the long-lived `cc-session` port and the
  service worker calls `chrome.tts` — `speech/remote-tts-port.js` presents the same contract as
  `speech/tts-port.js` so the orchestrator can't tell the difference. Prefer `chrome.tts` over
  `speechSynthesis` because it is immune to the page's autoplay rules. (1)

## Self-echo is an application problem, not a constraints problem

`webkitSpeechRecognition` **owns its own capture and exposes no hook for
`MediaTrackConstraints`** — you cannot ask the recognizer for echo cancellation. Chrome applies
its default AEC (a loopback of playout audio) to that capture, which already attenuates
`speechSynthesis`, but it misses `chrome.tts`'s OS-rendered output. So the residual echo is
handled at the app level by a string-match echo guard (REQ-SPCH-005), and that is the design,
not a stopgap. (2)

Two traps around this:

- `suppressLocalAudioPlayback` and `restrictOwnAudio` read like the fix for this and are not:
  they are **`getDisplayMedia` screen-capture** constraints, filtering a captured tab's own
  playout out of that tab's track, and `getUserMedia` ignores them without a word. The cost of
  reaching for one is not the dead property — it is that the echo guard that would have worked
  never gets written. (Enforced by the `mic-constraints-not-screen-capture` check.)
- The constraints you *can* set (`echoCancellation`, `noiseSuppression`, `autoGainControl`)
  apply only to the one capture you own — the permission preflight.

## Ask for the microphone in a moment you chose

Surface the permission prompt deliberately, with a short warm-up `getUserMedia` — not as a side
effect of the first listen cycle. Two rules for that preflight:

- **Run it even when permission is already granted.** Otherwise the device is only warmed, and
  AEC engagement only known, on the very first grant.
- **Retry once bare when the constrained call rejects.** A rejection is either a real denial or
  a browser balking at the constraint shape; only a second failure is a genuine denial. Reading
  a constraint quirk as "mic denied" ends the session for no reason.

(The capture must then be released on every path — that is the `mic-capture-released` check.)

## Endpointing is unreliable — plan for the miss

Chrome decides on its own when an utterance ended, and it does get it wrong: interim hypotheses
keep arriving and no final result ever lands. Left alone the user repeats themselves and you get
`"heart heart"`. The fix is a pause monitor that discards the half-heard input and reopens a
fresh cycle — with interim results used **only** as the "still speaking" signal, never delivered
to the caller. (That last half is the `stt-interim-results-gated` check; the monitor itself, and
the window below, are yours.)

Tune the window from real sessions, not from taste: 1.2 s cut real commands off solvers who
paused to think mid-instruction; 1.8 s keeps only the genuine missed-endpoint case. Anything
that ships an audible cue for the reset needs the same care — it fires often.

## Contextual biasing exists only on the on-device path

`SpeechRecognitionPhrase` / `processLocally` work only where Chrome has an on-device model.
Treat biasing as strictly best-effort:

- probe availability **once** and memoize the promise;
- accept only the literal `'available'` — never trigger a language-pack download;
- apply phrases inside a `try` and fall through to un-biased recognition on any failure;
- keep the un-biased path byte-for-byte unchanged (don't make every caller await a probe it
  doesn't need).

## Voices load lazily, and the default one is usually the worst

`getVoices()` returning an empty list means *"not ready yet"*, not *"no voices"* — resolve the
voice on first speak and, on an empty list, use the default and try again next time rather than
caching the empty answer. The OS default is often the most robotic voice installed, so carry an
ordered preference list and take the first installed match. That list is **taste, and taste has
been wrong here before**: treat both the voice order and the speaking rate as user-facing
settings with a modest default, not as constants to tune once. (3)

## Give recognition errors a taxonomy

Map the raw Web Speech error names onto a small named set the dialog policy can reason about,
and keep the mapping in one place. The policy cares about *kinds* — nothing heard, the mic was
refused, we aborted on purpose, the network went — not about spellings, and a `default → other`
arm means a browser inventing a new name degrades instead of crashing. (That the mapping is
total is the `stt-error-map-has-default` check; choosing the kinds, and keeping them in one
place, is not.) Log the codes short (`en`/`ed`/`ea`…) so a whole session fits in a diagnostics
dump.
