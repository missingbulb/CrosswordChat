---
name: revalidating-rules
description: Re-probe the pack rules whose truth lives outside the repository — harness tool contracts, token reach, whether an MCP tool exists, a platform's behaviour — and correct the ones that have gone stale. Use when a revalidation sweep runs over a corpus of packs, or when asked whether a rule's environmental claim still holds.
metadata:
  body: workflow
---

# Revalidating a rule against the world

Most of what a pack asserts is settled by reading the tree, and a check goes red when it stops being
true. A rule asserting a **fact about the environment** has neither property: nothing in the repo
turns red when a platform moves under it, so the prose stays green and the cost lands on a session
spent on a route that closed. Re-running the probe is the only thing that catches it.

**This skill owns the method, never the corpus.** Which packs a run revalidates is its caller's to
say — a task's `task.md`, or whoever asked. Take the corpus from there.

## What counts as a revalidatable claim

A sentence in a rule, a check's `failureMessage` or `fix` text, or a skill's procedure, that would be
**falsified by a change nobody in this repo makes**. The three richest seams:

- **The Claude environment** — tool contracts and their failure modes (what `Edit` requires before it
  will apply, what a scheduling call rejects, what a search returns for a bare name), which harness
  surfaces exist, what a session can and cannot see.
- **GitHub permissions and API behaviour** — what the Action's `GITHUB_TOKEN` may push or label, what
  a path refuses, which status a call returns, what a repository setting gates.
- **MCP functions** — that a named tool exists, what its parameters are called, what it returns,
  which server carries it.

Also fair game: any rule naming a version floor, a runtime's behaviour, or an external service's
response shape.

**Not** in scope, and left alone without a probe: judgment and taste rules; rules about how a repo is
organized, which a check already guards and a stale one fails loudly; product requirements; anything
whose truth a reviewer could settle by reading the tree.

## The probe

A claim is revalidated by **executing the smallest thing that would distinguish true from false**, and
reporting what actually happened — never by recalling what you know, and never by reasoning from the
rule's own wording.

Two rules bound it, and they bind every run whatever corpus it is working:

1. **Read-only.** Probe by doing the harmless half: call the tool and read its schema, request the
   resource, run the command that reports rather than acts. A claim whose probe would **write,
   delete, merge, publish, notify, or spend a credential** is not probed — verify it against
   authoritative documentation and say that documentation, not a run, is the evidence.
2. **A probe you cannot run is `unprobed`, not disproven.** This session carries the reach its repo
   was provisioned with, which is not the reach every rule was written under. A tool that is absent
   *here*, a permission denied *to this session*, a network path the sandbox blocks — none of that is
   evidence the claim is stale. Leave the rule exactly as it stands, log it as unprobed, and move on.
   Rewriting a rule into "you cannot do X" because *this* session could not is the single worst
   outcome available: it is unfalsifiable afterwards, and it removes a capability from every future
   session.

## The recorded reasons - reaffirm against the element's file

A pack's `provenance/` (the [writing-pack-prose](../writing-pack-prose/SKILL.md) convention: a rule
ending `(slug)` names its file; a check's file is named by its id) widens what a revalidation can
judge, because the file's entries record **what would retire the rule** - the one thing a probe
of the environment alone cannot know. For each element in the corpus, read its file's `Source`,
`Reason` and `Retire when` before probing:

- A **workaround** entry re-probes the recorded issue where the probe rules allow: if the problem it
  routed around no longer reproduces, the rule (or check) is a retirement candidate — proposed for
  the owner, never deleted on a run's own verdict, since the entry's evidence may exceed what one
  probe can re-create.
- A **technology guideline** entry is re-checked against the documentation it cites: a moved or
  contradicting source is corrected like any stale claim; an unreachable one is `unprobed`.
- An **owner decision** entry is not probeable — verify only that the decision hasn't been superseded
  in the repo's own record, and otherwise report it `doc-verified`.

What the run writes back, through `provenance.mjs append` in the same change: `reaffirmed` only
where the probe produced **new** evidence or changed `Retire when` - a rule found still true on the
old evidence gets no entry, and the run's pull request body is its record; `reworded` or `retired`
where the probe corrected the rule. An entry is never edited: a stale reason is answered by a new
entry. An **empty** file met on the way - an element whose history is not yet written - is filled
first, from `provenance.mjs history <pack> <element>`, source-first, as the
[backfilling-provenance](../backfilling-provenance/SKILL.md) skill describes; that is how a
member's local pack backfills on this cadence with no pass of its own.

## Correcting what is stale

Correct as far as the probe reaches and no further — one probe answers one claim, and a neighbouring
claim it seems to imply gets its own probe.

- **Rewrite the rule to what the probe showed**, in the same voice and at the same length, carrying
  the *new* fact — not a note about the correction, and not a dated changelog.
- **Where the claim was a check's premise** rather than prose, and the check is now asserting a dead
  fact, fix the check and its fixture.
- **Where a claim has become simply irrelevant** — the surface it describes is gone — delete the rule
  whole rather than trimming it toward nothing.

## Every verdict is reported, not just the corrections

Four verdicts — `holds`, `stale (corrected)`, `unprobed (why)`, `doc-verified` — each with the probe
behind it. A reader cannot re-derive any of this from the diff, and an `unprobed` claim needs naming
as loudly as a corrected one.

Order the work by what staleness would cost — a rule that would send a session down a dead path
before a version number in a comment — so a run that runs out of budget has spent it on the claims
that mattered, and says which claims it did not reach. Taking the whole corpus every time is what
lets a revalidation hold no state between runs: there is nothing to remember about what a previous
one covered.
