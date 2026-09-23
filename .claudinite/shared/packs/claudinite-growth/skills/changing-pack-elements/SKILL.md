---
name: changing-pack-elements
description: What a change to a pack's element owes - the entry on its provenance file, which kind, and how to append it - and what a pack's README carries. Loaded for any edit of a pack's RULES.md, skills, checks, tasks, manifest, README or provenance folder, in a repo's local pack or on a canon's shelf.
metadata:
  body: workflow
  usage:
    expect: triggered
  force-load-on-file-edits-paths:
    - "**/packs/*/RULES.md"
    - "**/packs/*/skills/**"
    - "**/packs/*/worldRules/**"
    - "**/packs/*/workRules/**"
    - "**/packs/*/declared-checks.json"
    - "**/packs/*/tasks/**"
    - "**/packs/*/pack.mjs"
    - "**/packs/*/README.md"
    - "**/packs/*/provenance/**"
---

# Changing a pack's elements

A pack's carriers - the rules in `RULES.md`, a skill and its triggers, a coded or declared
check, a task and its policy, the manifest - say *what* a session does. The decision behind
each - why it reads so, who decided, from what evidence, why this carrier and this trigger,
what was rejected, what would retire it - is one append-only file per element under the
pack's `provenance/`, read by maintenance and never by a session. Three things follow for
any edit under a pack.

## 1. The edit owes an entry, in the same change

Every change to what a carrier decides lands with an entry on the element's file, and the
`provenance-change-recorded` check says so again at the Stop hook when it did not. Which
file: the marker that ends a rule or guideline names it (`(url-filter-host-operators)` →
`provenance/url-filter-host-operators.md`), and two carriers may name one file while their
history is one; an unmarked guideline's is its skill's; a skill's is its directory name; a
check's its id with `/` as `-`; a task's its id; the manifest's `_pack.md`. Which kind:

| The change | Kind |
|---|---|
| a rule, guideline, skill body or step reads differently | `reworded` - or `strengthened` / `weakened` when the modality moved |
| a rule split in two, or two folded into one | `split` / `merged` (an entry on every file involved) |
| a guideline given a file of its own, its history having diverged from its skill's | `split` on the skill's file, `born` on the bullet's, with `Mechanism` |
| a rule moved to another carrier or pack | `moved`, with `Mechanism` |
| prose turned into a check | `converted`, with `Mechanism` and the deletion-test verdict |
| a skill's description or `force-load-on-*` trigger | `trigger-changed`, with `Mechanism` |
| a task's preconditions, `expected_outcome`, `automerge`, model or worker | `policy-changed`, with `Mechanism` |
| a check's severity, or the gate deciding when it fires | `severity-changed`, with `Mechanism` |
| what an element applies to, where its text reads the same - a manifest's `requires` or fingerprint, a check's file scope, a skill's corpus | `scope-changed`, with `Mechanism` |
| a new element | `born`, with `Mechanism` - and `mark` first if the carrier has no file |
| an element removed | `retired` - the file stays, and this is its last entry |
| a review that found new evidence or changed the retire test | `reaffirmed`; a review that found nothing new writes nothing |

No entry is owed for whitespace, a re-wrap, a code comment in a check, a fixture, a test, a
README row, a version bump, or the marking pass's own markers and `body:` lines.

Write the entry in the file grammar and append it through the tool, which validates it and
refuses one that carries a secret:

```
node packs/claudinite-growth/provenance.mjs append <pack> <element> <<'EOF'
## 2026-09-21 · reworded · the consequence clause said why twice (#2210)
- **Reason:** the second sentence restated the rule; cut.
- **Actor:** @handle (owner).
- **Model:** <the model this session runs, as the harness names it>
- **Landed:** #2210
EOF
```

In a member the tool is `.claudinite/shared/packs/claudinite-growth/provenance.mjs`, and
the pack is under `.claudinite/local/packs/`. `--changed` in place of the element appends the
same entry to every element the working tree's diff touched - a sweep's one-line entries.
The fields, each written only where there is something behind it: `Source`, `Reason`,
`Actor` (the person by handle with their role, or the run and who merged it - never an
email), `Model`, `Mechanism` (the carrier and its trigger, and why - required on `born`,
`converted`, `moved`, `trigger-changed`, `policy-changed`, `severity-changed`), `Rejected`,
`Retire when`, `Landed`. An entry never restates the rule: the carrier is the description,
the entry is the decision. A candidate turned down goes on `_declined.md` the same way, kind
`declined`, with `Source`, `Reason` and `Actor`.

**Size the entry to the decision, never to the work.** Most are three to five lines. Each
field is the shortest answer that is still an answer, and one clause is usually the whole of
one - `Reason: the folder never existed.` Where a required `Mechanism` keeps the carrier it
already had, the new value is the whole of it - `a regex` - and the why-clause is owed only
where the choice of carrier was itself the decision. The diff, the commit message and the
pull request already hold what changed, how it was proved and what it cost; an entry
retelling any of them writes the record twice and buries the line a review came for. Length
is earned only by a decision that was weighed - an alternative turned down, a constraint that
forced the shape - so a corrected path, a repointed pattern or a renamed field gets one line,
and a change nobody deliberated over gets `Reason` alone. Cut a field rather than pad it, and
cut one that repeats another field or the entry's own title.

A file is meant to grow: a wrong entry is answered by a later one, never by editing the one
that was wrong. The check advises against a line lost or altered and refuses nothing.

### The one lane that writes the past

`append` and `apply` are append-only, and the tool enforces it: an entry dated before the
file's last is refused, because a change being recorded now cannot have happened before the
change recorded last. **The backfill is the deliberate exception**, and `--backfill` on
either command is how it says so. It is deriving a history that already happened, so its
entries are dated in the past by definition, and under that flag the file is re-rendered in
date order rather than appended to. Two things only it may do:

- **Replace what the references conversion wrote.** A file the conversion filled carries a
  `born` dated by the conversion write rather than by the element. Where the derived birth
  is earlier, that placeholder is what is being corrected and the tool drops it, naming it
  in the run's output; where the placeholder's date *is* the birth, no earlier born arrives
  and it stands. The dates decide, so neither truncating these files as a class nor leaving
  them is the rule. Only the conversion's own entry is ever replaced - an entry somebody
  wrote is never dropped, whatever its date.
- **Open a file the marking pass could not.** An element retired *before* that pass is named
  by no carrier, so nothing will ever create its file. A `--backfill` batch that opens with
  `born` creates it; its whole history, birth through `retired`, arrives at once or not at
  all. Do not put such a history on `_pack.md` instead: a `retired` entry seals the file it
  ends, and `_pack.md` is the one file in a pack that must stay appendable forever.

Every other caller - every change being made now - uses the plain lane, where a file only
ever grows at its end.

## 2. The README carries use, never history

A pack's `README.md` is for the person adopting the pack or reaching for one of its
elements: when the pack activates, what each check demands and what satisfies it, when a
skill is the thing to load, what the task does to the repository, and the catalog of what
the pack carries. Never how an element came to be, what it replaced, why its id reads as it
does, what an earlier shape did, or how the pack is maintained. The test is the sentence: a
date, a pull request number, an "until", a "was", a "kept as it was" or a "distilled from"
is a decision, and a decision is an entry on the element's file - `_pack.md` for the pack's
own shape. Move it there; do not write it here.

## 3. The mount is never edited

A file under `.claudinite/shared/` arrived from a canon and the next converge replaces the
whole tree. Change it in the canon, or carry the difference in the repo's own
`.claudinite/local/packs/`.
