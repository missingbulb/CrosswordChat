## 2026-09-13 · born · replaces the speaking-content-script rule (#460)
- **Source:** the weekly prose-to-checks sweep, converting "Speaking from the content script" out of
  `RULES.md`.
- **Reason:** the contract between `speech/tts-port.js` and `speech/remote-tts-port.js` is a static
  signature — each factory's returned object literal — so a divergence is always checkable
  rather than left to prose.
- **Actor:** the claudinite-growth/prose-to-checks-sweep task; via #573.
- **Model:** Claude Sonnet 5.
- **Mechanism:** a `worldRules` rule module (`worldRules/tts-port-contract-parity.mjs`), parsing
  each port file's returned object literal — the pattern the check-the-world test needs, which a
  `declared-checks.json` pattern rule can't express.
- **Landed:** #460.
