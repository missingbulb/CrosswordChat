# References — rationale behind this pack's rules and checks

Maintenance and review material for the `writing-pack-prose` references convention: each entry
carries the reason a rule or check exists, written so a periodic review can reaffirm — or
retire — it. Entry keys are file-scoped stable identifiers (gaps allowed, never renumbered): an
end-of-line `(n)` marker in `RULES.md` cites `RULES-n`, one in a skill cites
`<skill-name>-n`, and `check:` entries cover checks. No session loads this file for daily work.

- **(RULES-1)** Verified live against nytimes.com during MT-02 (`dev/docs/MANUAL-TESTS.md`, the
  answer-injection go/no-go test): a bare `{key}`-only `KeyboardEvent` constructs `keyCode` and
  `which` as `0`, and the live app's key-handling layer branched on those legacy fields rather
  than `key`/`code`, so the synthetic keystroke silently matched nothing — recorded as a
  live-page hardening finding in `extension/src/page-adapter/writer.js`. Reaffirm against
  nytimes.com's markup and handlers; retire only if a re-verification shows the live handler now
  reads `key`/`code` instead of the legacy fields.
