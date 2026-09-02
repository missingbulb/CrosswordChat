# References — rationale behind this pack's rules and checks

Maintenance and review material for the `writing-pack-prose` references convention: each entry
carries the reason a rule or check exists, written so a periodic review can reaffirm — or
retire — it. Entry keys are file-scoped stable identifiers (gaps allowed, never renumbered): an
end-of-line `(n)` marker in `RULES.md` cites `RULES-n`, one in a skill cites
`<skill-name>-n`, and `check:` entries cover checks. No session loads this file for daily work.

- **(RULES-1)** Decision D2 in `dev/docs/ARCHITECTURE.md` §7: `chrome.tts` was chosen as the
  primary output path specifically because it is immune to the host page's autoplay policy,
  where `speechSynthesis` can be blocked. The decision's own revisit trigger: fall back to
  `speechSynthesis`-only if `chrome.tts` voice quality disappoints. Reaffirm while `chrome.tts`
  stays available to the extension and page autoplay policy still gates unprompted
  `speechSynthesis`; retire only if that trade reverses.
- **(RULES-2)** Decision D11 in `dev/docs/ARCHITECTURE.md` §7: the TTS-vs-listener echo conflict
  is handled by the app-level string-match echo guard (REQ-SPCH-005), not by constraining the
  recognizer's capture, because `webkitSpeechRecognition` owns its own capture and exposes no
  `MediaTrackConstraints` hook — Chrome's default AEC (playout loopback) already attenuates
  in-browser TTS but misses `chrome.tts`'s OS-rendered output. The decision's own revisit
  trigger: the Web Speech API gains a stream/constraints hook, or TTS output shifts to an
  in-browser playout path Chrome's AEC can reference and cancel. Reaffirm while
  `webkitSpeechRecognition` still owns an unconstrainable capture; retire only if that changes.
- **(RULES-3)** `extension/src/speech/tts-port.js`'s `PREFERRED_VOICES` list and its comment
  record that `'Google US English'` originally led the ranked voice preference but sounded bad
  to users, so the UK voices now outrank it (kept last, as a still-better-than-default
  fallback). Reaffirm while voice quality judgment stays subjective/taste-driven; retire only if
  a principled, non-taste voice-selection criterion replaces the ranked list.
