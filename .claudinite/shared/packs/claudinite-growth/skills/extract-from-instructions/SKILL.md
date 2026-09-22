---
name: extract-from-instructions
description: Convert instruction prose somebody already wrote - a repo's CLAUDE.md and everything it imports, or the person's own machine-local CLAUDE.md - into pack carriers, routing each rule to the repo's local pack or to that person's own pack and leaving the prose file a thin routing map. Use when adopting Claudinite on a repo that already carries a CLAUDE.md, when a person wants their machine-local instructions carried properly, or when asked to convert instruction prose into a pack.
metadata:
  body: workflow
  usage:
    expect: adoption
---

# Extract from instructions - prose somebody already wrote, poured into carriers

The other extraction skills mine *evidence* - what the commits did, what the conversation
stumbled over - and infer the rule. This one has the rules already: somebody sat down and wrote
them, as a `CLAUDE.md` or a file it imports. The work is not discovery. It is **routing each
written rule to the carrier and the owner it should have had**, and leaving the file it came
from carrying nothing a pack now carries.

Every rule in such a file loads in every session, always, whoever is working and whatever the
task. That is the cost this skill removes: a rule that only applies while releasing becomes a
skill that loads then, a rule a script can decide becomes a check, and a rule that is really
about *this person* stops being charged to everyone who clones the repo.

Two sources, routed differently:

- **The repo's `CLAUDE.md`** and everything it imports - tracked, shared, everyone's.
- **The person's machine-local `~/.claude/CLAUDE.md`** - theirs, untracked, and loaded in every
  repo they open. It exists only where the session runs on their own machine, so offer this half
  after reading that the file is there, never on the assumption that it is.

## 1. Gather, and read before sorting

Read each source whole, with what it imports, before writing anything. Split it into **candidate
rules**, one per thing the file asks of a session: a heading is not a rule, and a paragraph may
be three. Keep each candidate's original words beside your split - step 5 has to find them again
to cut them.

Read the repo's existing local pack and the mounted canon in the same pass. A rule the corpus
already carries is not converted: it is deleted from the source, and that is the whole of its
treatment.

## 2. Sort every rule by who it belongs to

Strip each rule along two axes and see what survives.

- **Swap the repository** - hand the rule to the same person on a different project. Still asks
  for something? It is about **the person**.
- **Swap the person** - hand it to a different teammate on this same repo. Still asks for
  something? It is about **the repo**.

| Survives | What it is | Where it goes |
|---|---|---|
| the repo swap only | one of that person's own rules | the pack that travels with them - `claude-code-web-users-support` owns where it lives and what it may hold; follow that pack's rules, and never write one of a person's rules into this repository |
| the person swap only | this project's convention | the repo's own local pack under `.claudinite/local/packs/` |
| both | portable, wanted by any repo sharing the facet | not yours to write: a member has no standing to author canon. Name it to the owner as a canon candidate and move on - `extract-packs-from-a-project` is the canon-side method if they take it up |
| neither | it was about one moment: a past fix, a restatement of the code | drop it, and report that you did |

Two shapes are caught here rather than routed. A rule asserting **what the product is or does** -
which entities exist, what a screen renders - is a requirement, so it goes to the project's
requirements document and never into a pack. And a rule that **describes** a mechanism rather
than instructing a session belongs in a README or a module header, where no session pays for it
every turn.

**Ask whenever the two axes come out close.** A person's rule filed as the repo's charges every
contributor for one person's taste, and a repo rule filed as a person's goes missing the moment
somebody else does the work; neither is visible in the result afterwards. The person's pack is
copied into every session they open on any project declaring that pack, so it may hold nothing a
project owns - which is the same sort, enforced from the other side. Batch every doubtful rule
into one `AskUserQuestion` pass, each quoted in its own words, rather than guessing or asking one
at a time.

## 3. Put each kept rule on the mechanism ladder

Routing says whose pack; the ladder says which carrier inside it, and prose is its last rung:
platform setting → schema → hook → check → skill → prose. A rule a script could decide becomes a
check with a red-first fixture, a procedure with a nameable trigger becomes a skill that loads at
that trigger, and recurring work with a cadence becomes a task. What is left - the in-flight
judgment no check can hold - is the only thing that earns a line in a `RULES.md`. The ladder runs
in the person's pack as much as the repo's: it is an ordinary pack and takes a skill or a check of
their own, so a personal rule is no reason to settle for prose.

This is where a conversion pays. A `CLAUDE.md` has exactly one rung available to it, so everything
in it was written as prose whether or not prose was right. Expect most of a long file to come out
as checks and skills, and read a conversion that landed every rule in `RULES.md` as a sort that
was never finished.

## 4. Write it into the destination pack

Author each rule as that pack's own kind of content: `writing-pack-prose` for a rule's wording and
its marker, `writing-repo-scanning-checks` for a check, `writing-tasks` for a task,
`writing-claudinite-skills` for a skill. Every element born here takes its `born` entry with
`Mechanism` naming why this carrier and this trigger, per `changing-pack-elements`; its `Source`
is the file the rule came from, cited by line.

## 5. Trim the repo's `CLAUDE.md`

Ask before cutting - it is the owner's file. What it becomes is a thin **routing map**: what this
project is, where its packs and its genuine design docs are, and nothing a pack now carries. It
does not `@import` pack prose, because the pack system injects the active packs' `RULES.md` at
session start and an import would load every converted rule twice.

Where the owner declines the trim, say what that costs: each converted rule now loads from both
places, and the two drift from then on.

## 6. Never write the machine-local file

`~/.claude/CLAUDE.md` is outside the repository. Nothing in git can undo a bad edit to it, and a
mis-sorted rule cut from it is simply gone. So read it, convert from it, and **leave it exactly as
it was**, whatever the person answered about trimming.

Hand back the trimmed version instead - in the session, in one delimited block whose boundaries
are unmistakable, for the person to paste over the file themselves. Say which rules you cut and
where each now lives, so the block can be checked before it is pasted rather than after.

## 7. At adoption

A repo adopting Claudinite usually arrives with a `CLAUDE.md` already written, and that is the
best moment to run this - before its rules are copied forward into a pack by hand.
`adopt-claudinite` makes the offer: whether to convert the repo's file, whether to trim it, and,
where the session can see one, whether to convert the person's machine-local file too. Both offers
ride the adoption interview's own batched pass, and the conversion lands in the adoption PR with
everything else.
