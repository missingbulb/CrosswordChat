---
name: writing-pack-prose
description: How pack prose is written - RULES.md rules, SKILL.md bodies and check text in a Claudinite pack, local or canon - brevity, structure, triggerability, findability, the marker that names a rule's provenance file. Loaded for any edit of a pack's RULES.md or SKILL.md, and when landing a lesson as prose.
metadata:
  body: guidelines
  force-load-on-file-edits-paths:
    - "**/packs/*/RULES.md"
    - "**/packs/*/skills/*/SKILL.md"
---

# Writing pack prose

Whether a candidate *qualifies* as a rule at all, and which mechanism carries it, is
[extracting-lessons.md](../../extracting-lessons.md)'s call — settle it there before writing.

**Start from the foundation:** read the "Write each rule" section of
[authoring-agent-docs](../../../basics/skills/authoring-agent-docs/SKILL.md) first — its
principles (concrete enough to verify, motivation stated, what to do rather than what not to,
the right altitude, emphasis reserved) bind pack prose too. This skill is the pack-specific
layer on top of them, and doesn't restate them.

## The ration

Every rule in a `RULES.md` is paid for by every session in every repo that declares the pack,
forever, whether or not it ever applies — so prose is rationed, and the ration is small.

- **One sentence per rule, near 40 words**: the trigger, the directive, and a consequence
  clause only where the rule cannot be applied without it. A candidate that needs a paragraph
  to land has not been understood well enough to be a rule yet. (sentence-rule-near)
- **An extraction pass adds at most two rules.** If more candidates clear the bar, write the
  two strongest and drop the rest — they will recur if they were real. (extraction-pass-adds)
- **Split a rule that carries two situations.** Each situation is its own rule with its own
  trigger. (split-rule-carries)
- A `SKILL.md` loads only when its activity is under way, so it may carry procedure at length —
  but it is still rationed by the same test: every line must change what the reader does.
  Method, steps and decision points belong there; anything a session must know *without*
  loading it belongs in `RULES.md` or a check, and rationale belongs on the element's
  provenance file (below). (skill-md-loads)
- **Moving a rule out of `RULES.md` into a skill** — only where the skill's
  `force-load-on-file-edits-paths` covers *every* moment the rule is needed. A skill whose only
  trigger is its description is picked by the model, not the harness, so a rule that must fire at
  a moment no file edit predicts stays prose, however activity-shaped it reads. (moving-rule-out)
- **Starting a `SKILL.md`, or editing one that declares no body** — say under its frontmatter
  `metadata` what the body is: `body: workflow` for a procedure, whose steps and their gotchas
  change as one, or `body: guidelines` for rules behind a trigger, kept on the skill's one file
  until one has a history of its own. A skill that mixes the two declares the shape of its
  greater part. The harness ignores the key; the corpus's own maintenance reads it, and never
  infers it. (starting-skill-md)

## Shape a rule so it fires

- **Keying a rule to its trigger** — open with the act the reader is performing, not the state
  of the world the rule applies to. Nobody notices that "a value is unknown"; they notice they
  are writing an encoder. A rule keyed to a state never fires, because nothing brings the
  reader to it. (keying-rule-trigger)
- **Keying a rule the reader reaches while debugging** — name the symptom that sends them
  looking ("A fetch to a host you listed failing in-browser"), not the act that caused it. By
  the time the rule is wanted the act is over, and the symptom is what they can see.
  (keying-rule-reader)
- **Keying a rule that corrects a misconception** — name what the reader wants ("Wanting
  `import`/`export` in extension code"), not the wrong move they might make ("Reaching for a
  bundler"). Someone who doesn't yet know the move is wrong won't recognise themselves in it.
  (keying-rule-corrects)
- **Phrasing that trigger** — use the words the reader would use for the situation, and put
  them first and in bold, so the rule is findable by scanning the left margin alone.
  (phrasing-trigger)
- **Choosing the unit** — one block per situation, not one bullet per rule. A reader arrives
  holding a problem, so give them the whole decision in one place rather than a cross-reference
  to three neighbouring bullets. (choosing-unit)
- **Splitting a rule that only makes sense after the one above it** — don't. If the subject
  needs a "that" pointing back ("Writing that record"), it is a clause of the rule above, not a
  situation of its own. Split when a reader could arrive at the second rule without the first.
  (splitting-rule-only)
- **Separating the blocks** — one blank line between rules. The block is what a reader lands on,
  and an unbroken run of bullets makes them scan lines instead; the separation costs one token.
  (separating-blocks)
- **Ordering a file of many rules** — past roughly fifteen, group them under headings naming the
  surface each concerns, so a reader scans headings before subjects. A flat list that long makes
  every bold subject do the work one heading would. (ordering-file-many)
- **Grouping that separates two rules which qualify each other** — add an explicit pointer from
  the general rule to its exception, or the general one reads as unconditional. That pointer is
  the one sentence a rewrite may add that its source didn't have; name it as an addition when
  you report the change. (grouping-separates-rules)
- **Ordering the clauses** — the default first, then the `if you can't` fallback, then
  `consider` for an optional aid, then the `don't` that the earlier clauses make unnecessary.
  (ordering-clauses)
- **Choosing modality** — grade it per clause and claim no more than the rule needs. Keep
  `never` and `always` for the genuinely absolute and reach for `prefer`, `avoid` or `rather
  than` otherwise; escalating a `don't` into a `never` changes the rule rather than rewording
  it. (choosing-modality)
- **Naming a mechanism** — name the check, helper or skill that owns the mechanics, and stop.
  Its parameters, options and failure modes live with it, and restating them here is a copy
  that goes stale. The exception is a mechanism you are telling the reader to *run*, below.
  (naming-mechanism)
- **Telling the reader to *run* something** — ship the literal invocation in a fenced block, not
  the file's name. The reader is composing a call rather than looking a mechanism up, so a bare
  filename buys a probe every time — the `--help` that prints nothing, then the `cat`, then a
  hand-built command. (telling-reader-run)
- **Closing a block** — say what the other clauses make unnecessary ("don't also comment the
  duplication — the guard covers it"), so nobody adds belt-and-braces. (closing-block)
- **Keeping an exception** — an exception that changes what the reader would do is part of the
  rule; one that only reassures is padding. (keeping-exception)
- **Cutting a rule's prose** — drop rationale that only restates the rule, examples that
  re-express it, and mechanics another document owns. Keep the motivation itself: a consequence
  the reader needs in order to apply the rule under pressure earns its clause; rationale the
  reader doesn't need at act time goes on the element's provenance file (below).
  (cutting-rules-prose)
- **Auditing a file of rules that already exists** — take each rule and ask what a reader would
  get wrong without it. Fold the one whose subject points back at its neighbour; cut the one another
  pack already carries, the one a check now enforces (keeping only the half the check can't see),
  and the one whose mechanism has since been retired — a rule naming code that no longer exists
  teaches a world the reader won't find. (auditing-file-rules)
- **Rewriting an existing rule** — carry the source's own strength forward. A rewrite must not
  weaken a rule, and it must not strengthen one either. (rewriting-existing-rule)

## The provenance log - where a rule's rationale lives

A pack keeps one file per element under `provenance/`, beside its `RULES.md`: an append-only
log of the decisions behind the element, read by maintenance and review - the pass that asks
whether a rule still earns its place needs the reason it was written - and never by a session.
No rule sends its reader there, nothing loads it, and it never vendors: a member mounting a
canon pack receives the rules, not the reasoning behind them. The grammar, the kinds, the
fields and the tool are [changing-pack-elements](../changing-pack-elements/SKILL.md)'s; what
this skill adds is how a rule is written so the log can hold it.

- **Ending a rule** - every rule in a `RULES.md` ends with the bare marker naming its file -
  `… never a filesystem walk. (url-filter-host-operators)` - and nothing else: don't name the
  folder, don't link it, don't ask the reader to follow anything. The marker is the element's
  id: two to four hyphenated words for the guideline rather than its wording, chosen once and
  never renamed, so a rewording never touches it and a member's override can name it. Two
  rules whose history is one may share a marker. A guidelines skill's bullets are the skill's
  file's and carry none, until one's history diverges and it takes a marker and a file of its
  own; a workflow skill's steps carry none, the skill being the element. (ending-rule)
- **Adding a rule** - write the brief rule and end it with its marker; create its file with a
  `born` entry through `provenance.mjs append` (`mark` creates the file where none exists),
  and put the reason there, never in the rule. A consequence the reader needs under pressure
  earns its clause; rationale the reader doesn't need at act time is the entry's. Write the
  entry so a future review can **reaffirm the rule from it** - `Retire when` is what would
  have to be true for the rule to go. (adding-rule)
  - A **workaround** explains the issue with not using it, with the evidence (the failing run,
    the error, the measured cost).
  - A **technology guideline** cites the original documentation it derives from.
  - An **owner decision** carries the language of the request that set it - in a member's
    local pack; a canon file carries the paraphrase, never the quote.
- **Rewording, moving, splitting or converting a rule** - the entry is owed in the same
  change, and the forced skill names its kind. (rewording-moving-splitting)
- **A check's rationale** - on the check's own file, named by its id (`cer/version-bumped` →
  `cer-version-bumped.md`); nothing is added to the check. (checks-rationale)
- **Removing a rule or check** - its file stays and gains a `retired` entry as its last, in
  the same change. (removing-rule-check)

The `provenance-integrity` check holds the mechanism together - every carrier names a live
file, every file parses - and `provenance-change-recorded` holds the change: a carrier that
changed lands with its entry. A pack not yet on the convention is put there by
`provenance.mjs mark`, and its history filled by the
[backfilling-provenance](../backfilling-provenance/SKILL.md) skill; nothing here is done rule by
rule.

## Evidence

The commit and its PR remain the archive - the story of the incident, quoted exchanges and
session ids live there and in the capture, never in the rule and never in a canon's log. What
an entry takes from them is only the **reaffirmable core**: `Source` and `Reason`, the minimum
a future review needs to re-test the rule, and `Retire when`, the test it is reaffirmed
against. Keep a measurement inline in the rule only where the number *is* the argument - a cost
the reader wouldn't believe stated qualitatively.
