# Spec-Driven Product Working Procedures — a portable playbook

This document defines **how the owner wants a spec-driven product project run**, as a **bootstrap to
drop into a new project of this class** from day one. The class: **build and ship a small end-user
product against an executable specification — every requirement is a numbered leaf claimed by exactly
one executable proof of the right kind, expected results are owned by the owner, and releases cut
automatically while `main` stays green.** The archetype is a UI-centric product (a browser-extension
panel, a small web or mobile app) and the examples lean that way, but the discipline applies wherever
observable behavior can be specified leaf by leaf — read "surface", "render", and "server" as whatever
they mean for your project.

It is written to be project-agnostic: it carries the durable working procedures and none of the
product, stack, or harness specifics of any particular project. Those live elsewhere — platform
gotchas in the project's technology packs, release mechanics in its release pack or release doc, and
the concrete spec, harness, and commands in the project's own docs. General test-trust practices
(see-it-fail, snapshot hygiene, the re-baselining approval procedure, capture-artifact-first) are
corpus canon in the writing-tests skill; this pack assumes them and adds the class's development loop
on top.

Treat it as a **default to adapt, not a contract**: when a rule here doesn't fit, say why and drop it;
when the project needs a rule this document lacks, add it in the project's own docs first. The
non-negotiable is the spirit: **the spec is executable, the expecteds belong to the owner, the real
code produces every actual, and the product ships on green.**

---

## 1. The executable spec is the backbone

- **One numbered requirements document states what the product must do**, leaf by leaf: what each
  surface must render, how it must behave, the exact copy and semantics it must carry. Not prose
  aspirations — specific, testable statements.
- **Keep the spec's boundary crisp: a leaf is what the harness can assert.** The feature-level story —
  what the product does and why — lives in the product's prose docs; the spec holds the specific,
  testable statements (exact strings, placement, semantics). A statement no kind can prove isn't a
  leaf yet: it stays prose, or it's the trigger to add the kind that can prove it.
- **Every leaf carries a stable id.** Add new requirements under new numbers; never renumber or reuse
  a retired one — the ids are what cases, commits, and review discussion key on, and a recycled id
  silently rebinds history to a different requirement.
- **Doc-first, red by default.** Adding a leaf with no executable proof fails the build until a case
  claims it. This is the mechanism that makes the document *the* spec rather than documentation: it
  cannot drift into wishfulness, because an unproven statement is a red build, not a stale sentence.
- **The spec drives the tests, never the other way around.** A behavior change starts by editing the
  leaf, watching the gate go red, then changing product and proof to match. A test changed without its
  leaf — or a leaf reworded to match what the code happens to do — inverts the authority.

## 2. Every leaf ⇄ exactly one proof, of the right kind

- **Enforce the bijection with a committed coverage gate**: each leaf claimed by exactly one case,
  each case claiming exactly one leaf, and every discovered kind of case actually executed by a
  runner. The gate is part of the project's own suite — the pack's discipline is self-enforcing
  because the project carries its own check.
- **A *kind* is one way a requirement can be asserted** — a rendered-state snapshot, a driven gesture,
  a pure rule, a boundary-enforced rule. Route each leaf to the kind that can actually observe what it
  asserts; the corpus's testing practices explain why one mechanism forced onto everything green-lights
  claims it can never check. Keep kinds **extensible** — adding one is a self-contained drop, so a new
  sort of requirement never gets shoehorned into the wrong proof.
- **A kind may be a singleton.** "The product loads in the real environment" is a perfectly good leaf
  whose mechanism is one end-to-end case; the kind names the *way of asserting*, not a population of
  cases, so one-member kinds are normal rather than a smell.
- **Give each kind's runner a named lane, and keep the default lane fast and deterministic.** Heavy
  real-environment kinds gate the merge from CI without slowing the inner loop; their trust rules
  (twice-green before merging, self-diagnosing on failure) are canon in the writing-tests skill.
- **Actuals come from the real code.** Whatever the kind, the proof drives the shipped entry points
  under a faithful harness — never a parallel re-implementation of what production "should" do (the
  writing-tests skill owns the general rule; it is load-bearing here).

## 3. Expected results are owner-owned

- **The committed expecteds are the owner's approval record of the product.** A case's success
  criterion encodes what the owner accepted, which is exactly what makes a green suite meaningful
  sign-off rather than self-grading.
- **The contract takes two honest shapes.** *Artifact-expected* (a committed render, an exact-values
  file): the owner approves a committed file — an agent may **propose** the expected for a brand-new
  leaf, but never modifies a committed one to make a failing case pass. *Coded-expected* (an
  assertion, a `verify()`): the expected **is** the assertion — keep it outside the write surface of
  whatever writes the product code, so passing by weakening the check isn't even expressible.
- **On a mismatch, surface actual vs. expected (and the diff) and ask.** The re-baselining procedure —
  diff shown, owner approves, only then re-baseline — is canon in the writing-tests skill, and it
  applies uniformly: to a moved render, a changed values file, and a failing assertion alike. An agent
  that adjusts the expected has quietly transferred ownership of the product to itself.
- **Expected changes ride the normal review flow** — they land in the diff like code, so the owner
  approves the product change and its new expected together, once.

## 4. State a requirement once; prove it at every boundary that enforces it

- **A product rule with more than one enforcing tier gets sibling leaves under one statement** — e.g.
  "only signed-in users can post": the surface's half (the client sends credentials) and the
  boundary's half (the server rejects an unauthenticated write) are separate proofs of one
  requirement.
- **The proof lives where the rule is actually enforced.** A surface-side test of a server-enforced
  rule proves only that the client cooperates, not that the boundary holds; if the real enforcement is
  the backend, a leaf must exist there, exercised against the real handler.

## 5. A supported-targets matrix is spec, not folklore

- **When part of the product's value is breadth over external targets** — supported sites, file
  formats, providers, locales — each supported target is its own leaf. Support is then claimed,
  proven, and counted like any requirement, and dropping a target is a visible spec change, not a
  silent regression.
- **Prove each target against a committed, real sample of it** (a captured page, a genuine file), with
  the owner-reviewed exact-values expectation committed beside it — capture the sample first and read
  the expecteds off the committed bytes (canon in the writing-tests skill). A hand-invented sample
  proves support for a target the world doesn't actually serve.
- **Adding a target is a documented, repeatable flow** that lands the new leaf, its real sample, and
  its reviewed expected together — the flow is what keeps a growing matrix uniform, and it is the
  natural first candidate when the project starts automating its own maintenance.

## 6. Green means "claimed", not "fully verified" — track the gap honestly

- **Say what the harness cannot reach, naming the exact boundary of each stub.** A faithful harness is
  still a model of the platform; the honest sentence pattern is "this proof confirms our code *asks*
  for the action, not that the platform *performs* it". Put that statement where readers of the spec
  will see it — a banner on the requirements doc, linking the issue that tracks closing the gap —
  rather than in a test README footnote.
- **Deliberate gaps are marked at the leaf and committed, never remembered.** A leaf that can't be
  faithfully verified yet stays in the spec, visibly provisional (a loud "to be decided" marker, and a
  pointer to whatever covers it meanwhile), and is listed in a committed allowlist the coverage gate
  checks — so a verified leaf can never be silently downgraded, and the allowlist is the burn-down
  list, shrunk deliberately. Prefer a real validation; reach for the marker only for a genuinely
  undecided edge case or a not-yet-wired harness.

## 7. The owner reviews the product surface, not the internals

- **Embed regenerated renders of the real states in the spec itself** — the requirements document
  doubles as a gallery of what the product actually shows, generated from the shipped code, so
  approving the spec *is* approving the product's appearance.
- **Regenerate, never hand-edit.** The gallery is derived output of a committed generator; fixing it
  means fixing the source (or the generator) and regenerating — a hand-touched render lies about the
  product until the next regeneration overwrites it.
- **The deterministic golden-image method this leans on is canon in the writing-tests skill** —
  matching the render engine to the surface (a bit-exact rasterizer for inline-styled/SVG surfaces, a
  headless browser for pages that use grid/vars/emoji/form-widgets), bundled fonts, capturing a
  host-page surface with styles inlined, and a drift gate on the embedded gallery. The pack states the
  *what* (approving the gallery is approving the product); the skill owns the *how*.

## 8. Ship automatically while `main` stays green

- **`main` is releasable at all times, and automation does the releasing** — a release (and, where
  the platform has one, store publication) cuts from `main` on its own cadence without a human build
  step. Keeping `main` green *is* the release gate: a red `main` is a shipping outage, fixed before
  new work.
- **The version users see moves deliberately.** Automation may patch-bump to ship, but a meaningful
  version change is a decision made on `main`, not a side effect. The concrete release contract —
  workflows, artifacts, store procedures — belongs to the project's release pack or release doc, not
  here.
