---
name: write-a-requirement-leaf
description: How a requirement leaf is written in the executable spec — the backtick-numbered one-liner with its detail collapsed under it, and which kind (surface snapshot, behavior, logic, saga, per-project, e2e singleton) its case takes. Use when adding or reshaping a requirement line in requirements.md.
metadata:
  force-load-on-file-edits-paths:
    - "dev/requirements/requirements.md"
---

# Writing a requirement leaf

## The line

- **A requirement line** starts (optionally after a list dash) with a backtick-wrapped dotted
  number: `` `4.2` ``. A **leaf** is an id with no finer-numbered child.
- **The line is a scannable one-liner; expanded detail collapses.** A leaf in `requirements.md`
  reads as a single line the owner skims down the numbered spine on GitHub. Any expansion —
  rationale, acceptance notes, edge cases, the owner-verification recipe — lives inside a
  collapsed `<details>` block under the line, hidden until the owner expands it. The doc reviews
  as a clean spec, not walls of prose; the depth is one click away when wanted, invisible when
  not.

## The kind vocabulary

Two forces pick a leaf's kind: what can **honestly observe** the assertion, and what gives the
**owner the simplest verification**. Prefer the kind whose expected is a **visual the owner checks
by sight** — a surface snapshot or a saga storyboard — and whose per-leaf test body is minimal:
drive to the state, capture, done, with the golden as the assertion rather than hand-written
expectations. Push as many requirements as can honestly be seen onto that visual path — the more
of the spec an owner verifies by *looking*, the more of it they actually review. Reserve the coded
kinds (behavior, logic) for what an image genuinely cannot see: a gesture's outgoing request, a
pure rule. Route each leaf to the kind that can actually see what it asserts:

- **surface snapshot** (`popup`, `icon`, `screen`, …): a rendered resting state, pixel-exact
  against a committed golden. One golden per leaf, even when several leaves render the same state
  — the bijection stays strict.
- **behavior**: a driven gesture and its outgoing request/consequence, asserted in code against
  the fakes' recordings. No images allowed in the folder.
- **logic**: a pure product rule, a coded `verify()` importing shipped code.
- **saga** ([write-a-saga](../write-a-saga/SKILL.md)): a multi-step story as a golden storyboard.
- **per-project kinds** where the product's value is breadth or crosses tiers: a per-target
  `extractor`/`support` kind (one case per supported external target, proven on committed real
  samples), a `server` kind (the boundary's half of a two-tier rule, against the real handler).
- **heavy/e2e singleton**: "the product loads in the real environment" — one case, its own lane,
  never in the default loop.
