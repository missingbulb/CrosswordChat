---
name: adopt-pack
description: Add packs to a repo already running Claudinite: declare, interview, re-vendor, scaffold, land. Use when asked to adopt, add, enable or declare a pack.
metadata:
  body: workflow
  usage:
    expect: adoption
---

Turn one or more packs on: declare, answer what the pack asks, materialize its content, satisfy what
it now demands. The declaration is authoritative — declaring is the project's call. Whole-repo
bootstrap and the on-demand refresh are [adopt-claudinite](../adopt-claudinite/SKILL.md)'s.

## 1. Declare

The full directory of adoptable packs — every canon pack with what it covers, how it activates,
and what it requires — is vendored in the mount at `.claudinite/shared/packs/directory.GENERATED.md`
(canon-side: `packs/directory.GENERATED.md`); read it when choosing, or when the owner asks what
could be added. **Match the owner's plain-words name to a pack id yourself** before asking them to
disambiguate — pack ids rarely read like how people describe them, so read the candidate's entry
there and confirm the fit.

Declare every chosen pack in one command:

```
cn adopt <id>[,<id>...]
```

It resolves every id and its `requires` closure before writing anything, so you declare what you
*chose* and its dependencies follow (e.g. `spec-driven-product` pulls `executable-requirements`);
it adds them to `packs.declared` in `.claudinite/settings.*`. A pack already declared is
**refused**, and so is an id no index lists; fix the name rather than editing the file by hand.

## 2. Interview — the part that is easy to skip and must not be

A pack that needs the project's intent before it can provide value declares `questions` on its
manifest (see packs/README.md); `cn adopt` prints the ones still unanswered
as its QUESTIONS block. For **every** newly declared pack that asks questions:

- Where a question says the repo may already hold the answer (a product brief, an existing
  requirements doc, the issue tracker), **read that first and confirm** rather than asking cold.
- Otherwise ask the owner directly (`AskUserQuestion`), one question at a time, at the point of
  adoption — when a human asked for the adoption, they are present by construction.
- Record each answer **verbatim** with `cn settings answer <pack>/<question> <text>`, which
  writes it on that pack's entry as `answers`. `"n/a — none wanted"` is a valid answer and stops
  the asking. Where the question carries a `distill` note, derive the entry's `config` from the
  answer (e.g. `executable-requirements`'s spec path → `config.spec`).

### When nobody is there to ask

Adoption also runs **unattended** — a scheduled task acting on a recommendation, the
fleet-add-missing-packs task's agent stage, any run with no human in the loop. The interview is then the hard stop, and
the order matters:

1. **Never guess an answer, and never leave the question unrecorded.** A pack whose question is
   answered by inference carries a decision nobody made, in a file that then propagates by
   `requires` closure and outlives whoever could have corrected it. `"n/a"` is an *owner's* answer,
   not a default you may write on their behalf.
2. **Finish everything the question does not gate, first** — declare, re-vendor, scaffold, and get
   the checks green (§4, §5). Stopping at the question with a red repo hands the owner a broken
   tree *and* a question; stopping with a green one hands them only the question.
3. **Then stop, and hand off in the open.** Open the PR with what is settled, name each unanswered
   question in the PR body under a heading that says the adoption is incomplete, and say the same
   on whatever issue prompted the run. Do **not** merge, do not proceed to a next pack's interview,
   and do not re-run the adoption on a later firing hoping the answer appeared — an unanswered
   question is a human's, and re-asking it weekly is nagging.

A pack that asks nothing adopts fully unattended; this section costs it nothing.

## 3. What `cn adopt` already did

The same command vendored the new packs for the pinned engine under `.claudinite/shared/packs/`,
regenerated the rules and skills indexes, and printed a line for each file it wrote on the pack's
behalf: `seeded <path>` for a pack's `seedOps` (written once, owned by the repo from then on) and
`stamped <NAME> into .github/workflows/claudinite-executor.yml` for each secret a new pack's tasks
need. Both belong in this pull request; never hand-copy a pack's files into the mount instead.
The skills mount at the next SessionStart.

## 4. Scaffold what the pack now demands

A newly active pack may require structure the repo doesn't have yet — deliberately, so the
declaration is a statement of intent that its own findings then guide you to satisfy. Run the
world sweep and let each finding name the file: e.g. `product-wiki` wants its index and the
reviewed `product-requirements/` sink before the isolation wall has anything to guard. Scaffold
per the pack's own README template; the pack's rules are the checklist.

## 4b. File what adoption cannot do

A pack may declare `adoptionHandover` — steps only a human can perform (a repository or
console setting, a permission, a secret). `cn adopt` prints them as its HANDOVER block; they are
not optional and they are not PR-body notes. **Open one tracking issue per adopting repo**,
a checkbox per step, written per
[writing-handover-issues](../../../basics/skills/writing-handover-issues/SKILL.md) — so
each step's `breaks` (what is broken while it is off) and `done` (its closing condition)
travel in the section below the checklist, never between the boxes. Per-repo manual work reliably does not happen,
so an unfiled step is a capability that dies silently in that member.

Say on the adoption PR that the issue exists and link it. If the repo already has an
open issue for the same steps, comment there rather than opening a second.

## 5. Land

World and work checks green (`cn check world`; the Stop hook carries the work checks). Commit referencing the task's issue, push, open one PR. Content a pack
seeds through this flow — a `product-wiki` wiki's first researched, cited pages — rides the same
review gate as any other change; it is never pushed straight to the default branch.

**A failing check is your work, not the reviewer's.** Declaring a pack is what switched those rules
on, so every finding they now produce belongs to this change — fix it here, in the repo, before the
PR opens. Two things that are *not* fixes: silencing a rule by adding it to `checks.rules`/`checks.accept`
in `.claudinite/settings.*`, and undeclaring the pack to make the findings stop. Both turn a real
signal off on the repo's first exposure to it. If a finding genuinely cannot be satisfied — the pack
demands structure this repo has decided against — that is evidence the pack is **not** the right fit:
drop it from the declaration, say why on the PR, and let the smaller adoption land.

**Never leave the repo red.** Whatever stops you — a check you cannot satisfy, an unanswered
interview question, a scaffold that needs a decision — get the tree green first and open the PR on
what is settled. An incomplete adoption in a green repo is a handoff; an incomplete adoption in a
red one is a bug report against you.
