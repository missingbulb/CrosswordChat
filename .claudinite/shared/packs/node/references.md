# References — rationale behind this pack's rules and checks

Maintenance and review material for the `writing-pack-prose` references convention: each entry
carries the reason a rule or check exists, written so a periodic review can reaffirm — or
retire — it. Entry keys are file-scoped stable identifiers (gaps allowed, never renumbered): an
end-of-line `(n)` marker in `RULES.md` cites `RULES-n`, one in a skill cites
`<skill-name>-n`, and `check:` entries cover checks. No session loads this file for daily work.
- **(RULES-1)** Verified in this session against jsdom 30.0.1 on Node v22.22.2:
  `document.body.innerText` came back `undefined` — falsy, so `el.innerText || el.textContent`
  does fall through to `textContent` exactly as the rule describes, and a visible-text scrape
  can pass under test while finding nothing or the wrong thing in Chrome. **Precision note for
  a future review**: the value is `undefined`, not `null` as the rule's wording says; the
  behaviour the rule turns on is unaffected. Recovered from the rule's own pre-#467 text (cut
  by 2f3e4e9a as “consequence prose arguing for a rule rather than enabling it”, before this
  pack had a references.md to hold it).
- **(RULES-2)** Verified in this session against jsdom 30.0.1 on Node v22.22.2. Parsing `<div
  id=x>A<noscript><b>NO</b></noscript>B</div>`: under the default `runScripts` the `<noscript>`
  was parsed into live DOM (one child element) and `textContent` read a clean `"ANOB"`; under
  `runScripts: "dangerously"` the `<noscript>` was kept as raw text (zero child elements) and
  `textContent` read `"A<b>NO</b>B"` — the markup splicing into the value that a real browser
  produces. The default is the opposite of a browser, and the test-passes/production-fails
  asymmetry is confirmed in both directions. Recovered from the rule's own pre-#467 text (cut
  by 2f3e4e9a as “consequence prose arguing for a rule rather than enabling it”, before this
  pack had a references.md to hold it).
