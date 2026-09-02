# References — rationale behind this pack's rules and checks

Maintenance and review material for the `writing-pack-prose` references convention: each entry
carries the reason a rule or check exists, written so a periodic review can reaffirm — or
retire — it. Entry keys are file-scoped stable identifiers (gaps allowed, never renumbered): an
end-of-line `(n)` marker in `RULES.md` cites `RULES-n`, one in a skill cites
`<skill-name>-n`, and `check:` entries cover checks. No session loads this file for daily work.

- **(check:declarative-content-set-icon)** #777's finding: `declarativeContent.SetIcon` with the
  documented `path` option can silently leave the action icon unset — the rules are evaluated by
  the browser process, which needs raw pixels at registration time, and there is no throw and no
  console error to notice. Reaffirm by re-testing `path` on a current Chrome; retire the check
  only if Chrome makes `path` work (or fail loudly) there.
