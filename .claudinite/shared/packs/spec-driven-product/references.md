# References — rationale behind this pack's rules and checks

Maintenance and review material for the `writing-pack-prose` references convention: each entry
carries the reason a rule or check exists, written so a periodic review can reaffirm — or
retire — it. Entry keys are file-scoped stable identifiers (gaps allowed, never renumbered): an
end-of-line `(n)` marker in `RULES.md` cites `RULES-n`, one in a skill cites
`<skill-name>-n`, and `check:` entries cover checks. No session loads this file for daily work.
- **(RULES-1)** A recycled id silently rebinds history to a different requirement: ids are what
  cases, commits and review discussion key on, so reuse corrupts the record rather than merely
  confusing a reader — and it does so without any failure. Recovered from the rule's own
  pre-#467 text (cut by 2f3e4e9a as “consequence prose arguing for a rule rather than enabling
  it”, before this pack had a references.md to hold it). Reaffirm while ids are the join key
  across cases, commits and review; retire if traceability moves to a content hash.
- **(RULES-2)** This is the mechanism that makes the document *the* spec rather than
  documentation: it cannot drift into wishfulness, because an unproven statement is a red
  build, not a stale sentence. Recovered from the rule's own pre-#467 text (cut by 2f3e4e9a as
  “consequence prose arguing for a rule rather than enabling it”, before this pack had a
  references.md to hold it). Reaffirm while the coverage gate runs on every build; retire if
  the gate stops being blocking.
- **(RULES-3)** One mechanism forced onto everything green-lights claims it can never check —
  the same lesson `packs/basics/references.md` records as `(writing-tests-1)`, where a
  UI-snapshot coverage gate “covered” behavioural leaves it could not observe (#429).
  That cross-pack corroboration is why kinds are routed rather than unified. Recovered from the
  rule's own pre-#467 text (cut by 2f3e4e9a as “consequence prose arguing for a rule rather
  than enabling it”, before this pack had a references.md to hold it). Reaffirm alongside the
  writing-tests entry; retire only if both are retired together.
- **(RULES-4)** A case's success criterion encodes what the owner accepted, which is exactly
  what makes a green suite meaningful sign-off rather than self-grading — the expecteds are an
  approval record, so their authorship is the whole property. Recovered from the rule's own
  pre-#467 text (cut by 2f3e4e9a as “consequence prose arguing for a rule rather than enabling
  it”, before this pack had a references.md to hold it). Reaffirm while the owner approves
  expecteds; retire if sign-off moves to another artifact.
- **(RULES-5)** An agent that adjusts the expected has quietly transferred ownership of the
  product to itself — the strongest statement of why a mismatch is surfaced and asked about
  rather than absorbed. Recovered from the rule's own pre-#467 text (cut by 2f3e4e9a as
  “consequence prose arguing for a rule rather than enabling it”, before this pack had a
  references.md to hold it). Reaffirm while an agent can write the expecteds; retire only if
  they are made unwritable to it.
- **(RULES-6)** A hand-touched render lies about the product until the next regeneration
  overwrites it — the edit looks like a fix and is really a temporary falsehood with a delayed,
  silent reversal. Recovered from the rule's own pre-#467 text (cut by 2f3e4e9a as “consequence
  prose arguing for a rule rather than enabling it”, before this pack had a references.md to
  hold it). Reaffirm while the gallery is generator-derived; retire if it becomes hand-authored
  source.
