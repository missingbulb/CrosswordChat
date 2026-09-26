---
name: triaging-usage-findings
description: Turn a lasting usage-review finding into a proposed change, written as the edit itself. Use on a usage-triage run, or when asked what to do about a finding.
disable-model-invocation: true
metadata:
  body: workflow
  usage:
    expect: judgment
---

# Triaging a usage finding

A finding is evidence that a decision may be due, never the decision. Your output
is one pull request per subject carrying the **edit itself** - the moved lines,
the changed trigger, the demoted on_fail - because a proposal is worth only as
much as the diff it can be read against, and a decline costs a close.

Never merge what you open.

## 1. Read the subject's provenance file first

Before the figures. The element's file under its pack's `provenance/` is the
decision log, and five things in it change what you may propose:

- **`Rejected`** - this exact cause already considered and refused. The finding is
  then not new evidence; say so on its issue and open nothing.
- **`Source`** - what the element was born from, so the proposal undoes no lesson
  it never read.
- **`Mechanism`** - why this rung of the ladder. A refused rung is not re-proposed
  without new evidence, and the figures are the only thing that could be new.
- **An entry recording a change already made after an earlier finding on this
  element** - a finding that returns after a mitigation is a different case from a
  first one, and the proposal is about the mitigation having failed.
- **`Retire when`** - the test the element set for its own retirement. The finding
  may be that test coming true, which makes the proposal a deletion.

Read the pack's `_declined.md` too: a proposal the owner closed unmerged has an
entry there naming the rule, and re-proposing it spends another close.

## 2. Work the rule's causes in order

The finding carries them in likelihood order, each with the discriminator that
tells it apart - a counter, a digest, a line in the sample. Work them in that
order against the finding's own figures, and name the one you settle on.

Where the list is `open`, a cause outside it is a real answer. Where it is closed,
the mechanism settles it and you are choosing among the listed ones.

## 3. Write the change only where a cause is settled

Otherwise comment the finding's issue with what you read and what would settle it,
and open no pull request: an unsettled proposal rewrites content that may have
been right.

Where it lands, the pull request carries the element's provenance entry in the
same diff, so the log entry merges only if the change does - a declined proposal
leaves the log untouched, which is the correct record of a decision not taken.
[changing-pack-elements](../changing-pack-elements/SKILL.md) names the kind. That
entry's `Source` names the usage rule by id and the finding's issue by number,
with the figures it was read from:

```
- **Source:** usage review rule `skill-forced-only-small`, #2211 - 31 loads in the
  28 days to 2026-10-03, 30 of them held by a guard; 212 tokens.
```

So a reader tracing a mechanism change backwards lands on the rule that thought so
and the figures it thought it from.

## What the body says

The cause settled on and what settled it, the provenance fields read, the window
the finding was written from, and the finding's issue number. A proposal merged
weeks later lands against figures that have since moved, and the window is what
lets a reviewer see that.

One pull request per subject, never two open at once for one: a stale proposal is
closed rather than amended, because the figures it argued from have moved.
