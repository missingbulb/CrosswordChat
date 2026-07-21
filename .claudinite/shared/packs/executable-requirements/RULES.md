# Executable requirements — the framework standard

The concrete conventions for running a numbered spec as tests. The judgment layer — doc-first
red-by-default, owner-owned expecteds, honest-gap tracking — is the
[spec-driven-product](../spec-driven-product/RULES.md) playbook; this pack is the mechanics that
implement it, so a new project or a new stack adopts the framework by convention instead of
re-deriving it. Worked implementations: GoogleCalendarEventCreator (origin; extension/jsdom
rendering), TLDR (adds a cross-tier `server` kind), ShoutsAndWhispers (Flutter port; first `saga`
kind).

## 1. The layout is the contract

- Everything lives under **`dev/requirements/`**: `requirements.md` (the numbered prose spec),
  one **top-level folder per kind**, `shared/` for cross-kind infra, and the runners/gates. The
  spec file's path is the framework's structural fingerprint — this pack activates on it.
- **A requirement line** starts (optionally after a list dash) with a backtick-wrapped dotted
  number: `` `4.2` ``. A **leaf** is an id with no finer-numbered child. Parse with one shared
  regex (`` ^\s*(?:-\s+)?`(\d+(?:\.\d+)+)` ``) so specs stay drop-in compatible across projects.
- **The folder is the kind.** A case's kind is the directory it lives in — the case declares no
  kind field, so classification cannot drift. Cases are
  `<kind>/cases/<slug>.<leaf-id>.case.<ext>`: a stable feature slug (so retitling a spec section
  never forces renames), then the dotted leaf id. The filename **is** the leaf link.
- **Artifact expecteds live beside their case** (`<slug>.<id>.png`, `expected/<name>.json`);
  failure artifacts (actual/diff renders) go to a gitignored dir, never beside the goldens.
- Where the language discovers cases dynamically (Node `require`), the registry walks the
  folders; where it cannot (Dart/Flutter), each kind keeps a hand-written `manifest` and **the
  gate enforces manifest ⇄ disk equality** — a case file that exists but isn't registered never
  runs, so unregistered must be red.

## 2. What the coverage gate checks

The bijection gate is one committed test, and it is the framework's spine. It must fail on every
one of: a leaf no case claims (doc-first red-by-default); a case claiming a non-existent leaf; two
cases claiming one leaf; a misnamed case file; a kind directory absent from the registry (or a
registered kind with no directory); a manifest out of sync with disk (where manifests exist); an
image found in a coded kind's folder (a screenshot cannot verify a gesture or a pure rule); a
stray golden no case or step accounts for. Every rule iterates the registry — adding a kind never
edits the gate.

The gate checks repo state; an interactive feature run also has an *ordering*: after the
owner's feature-classified comment, an independent commit updating the spec (no code alongside)
precedes the first code commit on the branch. The spec's path defaults to the canonical
`dev/requirements/requirements.md`; a project whose spec lives elsewhere (a non-canonical
layout, or the pack pulled in via a `requires` from `spec-driven-product`) names it on the pack
entry as `config.spec`.

## 3. The kind vocabulary

Recurring kinds, by what they can honestly observe — route each leaf to the kind that can actually
see what it asserts:

- **surface snapshot** (`popup`, `icon`, `screen`, …): a rendered resting state, pixel-exact
  against a committed golden. One golden per leaf, even when several leaves render the same state
  — the bijection stays strict and each golden is named for what it proves.
- **behavior**: a driven gesture and its outgoing request/consequence, asserted in code against
  the fakes' recordings. No images allowed in the folder.
- **logic**: a pure product rule, a coded `verify()` importing shipped code.
- **saga** (§4): a multi-step story as a golden storyboard.
- **per-project kinds** where the product's value is breadth or crosses tiers: a per-target
  `extractor`/`support` kind (one case per supported external target, proven on committed real
  samples), a `server` kind (the boundary's half of a two-tier rule, against the real handler).
- **heavy/e2e singleton**: "the product loads in the real environment" — one case, its own lane,
  never in the default loop.

## 4. Sagas: stories as storyboards

Single frames prove states; **sagas prove transitions and causality** — what arriving, acting, or
time passing *changes*. Use a saga when the requirement is the story ("a message sent before I
arrived never appears; one sent after I arrived does"), not decomposable into independent resting
states without losing the claim.

- A saga case is an ordered list of **steps**; each step = a caption plus an action against the
  fake world; after each step the runner captures one golden frame `<slug>.<id>.step-NN.png`.
- The **caption narrates the story** in user terms — captions surface in the gallery, turning the
  spec into a storyboard strip the owner reviews like a comic.
- One saga = one leaf; the frames are that one case's expected (all frames pixel-exact, same
  ownership rules as any golden). Keep sagas to 3–6 frames; a longer story is usually two sagas.
- Saga steps drive the **same real entry point** as every other kind (the shipped app shell/render
  function) — a saga must never become a scripted slideshow of hand-arranged states.

**Animated saga goldens** (recording the motion, not the frames). A per-step frame proves a resting
state; a saga can instead be **one animated golden** — an APNG per leaf — recording the real UI
*moving* between steps, so a transition is proven, not just its endpoints. What keeps it
delay-free and deterministic:

- **Strip dead delay, keep the animation.** Render time is virtual, so a scripted wait is a run of
  *identical* frames — dedup consecutive identical frames and clamp any single hold, so the golden
  holds motion, never waiting (a 3 s wait must not become 3 s of golden).
- **Lossless, so byte-identity still holds.** Encode APNG, not GIF (whose palette and dithering
  aren't deterministic); the comparison stays exact byte-identity and a mismatch writes a per-frame
  `expected | actual | diff` to the gitignored failures dir. Capture at a low DPR — lossless costs
  no fidelity for it. Flutter reads each frame off the `RepaintBoundary` via `toImage` inside
  `runAsync` (the fake-async test zone won't otherwise complete the byte read).
- **Mark the gesture.** Paint an expanding ring at each real pointer gesture over the pre-reaction
  frame so the strip shows *where* the user acted; programmatic world changes draw none.

## 5. Determinism or it isn't spec

A rendered expected is only owner-ownable if it is byte-stable forever:

- **Pin the clock.** One shared reference time (`REFERENCE_NOW`) threaded to everything that
  formats or compares dates; fixture data is authored relative to it. Never wall-clock.
- **Fake every nondeterministic input**: network (map tiles, avatars — deterministic generated
  substitutes), randomness, platform sensors, locale (pin it; date copy is locale-sensitive),
  viewport (one fixed logical size and pixel ratio).
- **Load real fonts** in the render harness — test environments default to a glyph-less stub that
  renders text as boxes, making goldens unreviewable. Load the product's bundled families plus the
  icon font; watch for styles that don't inherit the family (button text styles are the classic
  leak) — pin the family there explicitly.
- **Never wait for "settled".** Indeterminate spinners animate forever; use fixed-duration pumps
  so an in-flight state is a capturable, deterministic frame.

## 6. Rendering recipes per stack

- **Browser-extension / DOM products** (the origin recipe): feed the case's fake data to the real
  `render()` in a jsdom document seeded from the real HTML, fold the real CSS on as inline styles,
  rasterize with satori + resvg, compare with pixelmatch at **zero tolerated diff ratio**. No real
  browser: deterministic and dependency-light, at a documented fidelity tradeoff.
- **Flutter**: widget-test golden files are the native equivalent — pump the real app shell
  against the fake world and `matchesGoldenFile`; `--update-goldens` is the refresh lane. Load
  fonts from the FontManifest (icons included). The fake world (scripted location/auth/backend
  that also *records* what the UI asked) is the product's own testing library so the requirements
  package and unit tests share it.
- Whatever the stack: the comparison is **pixel-exact**. A tolerance is a standing invitation for
  unreviewed drift; if a platform renders unstably, fix the determinism (fonts, clock, fakes), not
  the threshold.

## 7. The gallery is derived output

- The spec doubles as a visual gallery: under every image-kind leaf, machine-managed image lines
  (tagged with an HTML comment marker) embed the committed goldens — saga leaves get their full
  captioned storyboard strip. Approving the spec is approving what the product shows.
- A committed **gallery gate** keeps the doc equal to the generator's output byte-for-byte.
  Regenerate via the tool; a hand-edited gallery line lies about the product until the next
  regeneration overwrites it.

## 8. Refresh is a review step

One committed refresh entry point regenerates all goldens **and** the gallery together, so they
cannot skew. Running it is how an *intended* UI change lands — the refreshed PNGs ride the diff
for the owner to approve. It is never how a red case gets fixed: the re-baselining approval
procedure (surface actual/expected/diff, ask, only then re-baseline) is canon in the
writing-tests skill and the spec-driven-product playbook, and it applies to every kind's expected
alike.
