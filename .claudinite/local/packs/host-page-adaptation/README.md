# host-page-adaptation pack (local)

A pack for **being a guest in a web app you do not own**: reading its DOM, driving it with
synthetic input, watching it change, injecting your own UI into its chrome, and surviving the
day it is redesigned. Declared by hand as `local/host-page-adaptation` in
`.claudinite-settings.json`.

**Every rule judges a DOM/API contract, not a product decision.** Each one holds for any code
driving a third-party page — a userscript, a browser-automation layer, an extension's content
script — and nothing in a rule's logic, rationale or fix text is specific to this repo. The scan
is repo-shape agnostic (see below), so the pack cannot pass vacuously green somewhere laid out
differently. This repo is where the rules were *discovered* and is the corpus they are verified
against; it is not what they are about.

**Why local, not a canon declaration:** the mounted canon shelf has no home for this facet. The
`chrome-extension` pack covers MV3 *mechanics* — manifest, permissions, how a content script is
registered and why it can't be an ES module — i.e. how your code reaches the page; it says
nothing about what to do once it is there. `chrome-extension-release`, `node`,
`github-actions`, `tidy-repo`, `spec-driven-product`, `executable-requirements` and `barriers`
are orthogonal, and the sibling local pack `browser-speech` owns the speech surfaces, not the
page. Nothing here duplicates a canon rule.

**Provenance:** distilled from this repo's real usage — the whole of
`extension/src/page-adapter/` (`selectors.js`, `reader.js`, `writer.js`, `watcher.js`,
`probe.js`, `splash.js`, `session-button.js`), the REQ-PAGE and REQ-LIFE requirement families
in `dev/docs/REQUIREMENTS.md`, the quarantine rule REQ-PAGE-011 and its arch test
(`extension-test/unit/arch.test.js`), the live-page findings recorded in `writer.js` (MT-02) and
in `selectors.js`'s dated verification notes, and the fake-host fixture
(`extension-test/fixtures/fake-nyt/`). Nothing in it is invented.

**Promotion note:** the checks are written to be lifted as-is — repo-shape agnostic scan, DOM
contracts only, no project identifiers in any rule's logic or messages — so the central promote
stage should be able to move them into a canon pack for this facet (`host-page-adaptation`, or
whatever a canon `html`/DOM pack calls it) with only the `doc:` paths rewritten. The `RULES.md`
prose is the part still worth re-reading for project coupling at promote time: several rules
cite this host's specific behaviours (the ~30 s idle auto-pause, the pencil button with no
readable state) as evidence, and those are examples of a category, not constants.

## Checks

| Check | Enforces (≤5 words) | Severity |
|---|---|---|
| `page-observers-disconnected` | started DOM observers get disconnected | blocking |
| `synthetic-input-events-bubble` | dispatched input events set bubbles | blocking |

**Scope.** Both scan any browser source file (`.js/.mjs/.cjs/.ts/.tsx/.jsx`) except test
and vendor paths — never a hard-coded project root. Each rule is gated on the DOM API it judges
actually appearing in the file, so the API usage *is* the trigger and the scan can be
repo-shaped; a path scope wired to one layout would make every rule match zero files and pass
vacuously green elsewhere, which is the worst failure mode a check has. The exclusion that
matters is test scaffolding: a test dispatching a bare event at its own jsdom node, or spinning
an observer it lets the runner collect, is doing something purpose-built and is not adapting to
a host page.

**Parsed, not grepped, where the name alone doesn't decide it.**

`synthetic-input-events-bubble` judges only events that are actually **dispatched** (a probe
event constructed to feature-detect is not input), only the interfaces that model **real user
input** (a `CustomEvent` is your own signal to your own listener and is legitimately
non-bubbling), and it resolves each side of the dispatch through **one hop**: the constructor
through an alias (`const Ctor = isKey ? view.KeyboardEvent : view.MouseEvent` is how a generic
`fire()` helper is written, and this repo's single dispatch site is exactly that shape), and
the dispatched value through a local (`const ev = new MouseEvent('click');
el.dispatchEvent(ev)` is the other shape real dispatch code takes). An init that spreads
(`{ ...init }`) without an explicit `bubbles:` is beyond what the rule can see, so it stays
silent there: the caller may well set the field, and a check that guessed would false-alarm on
precisely the well-factored helper that centralises this.

**A third check was cut at review.** `synthetic-key-events-legacy-fields` (a synthetic
`KeyboardEvent` init must carry `keyCode`/`which`) enforced a real live-page lesson (MT-02) —
but this repo's only key-event construction builds its init in a helper and spreads it at the
one dispatch site, exactly the shape a spread-silent check can never read. A check that is
structurally blind to the house pattern can only ever fire on code that bypasses the `fire()`
helper, and the mistake in that code is the bypass, not the field it then forgot. The lesson
lands as prose instead (`RULES.md`, "A synthetic keystroke must carry the fields a real one
would").

`page-observers-disconnected` is deliberately **file-scoped, not flow-scoped**: proving a
particular observer is disconnected on every path needs real data-flow analysis, and a check
that guesses is worse than one that asks a simple, honest question — "this file starts an
observer on the page; does it anywhere disconnect one?". An observer constructed but never
`.observe(`d has started nothing and is not asked.

Red-first fixtures live in `pack.test.mjs`: each rule is run against violating sources and
clean ones — in both the direct and the aliased-constructor form, in TypeScript under a plain
`src/` as well as JavaScript — and then against this repo's real `extension/src/` tree, which
must stay quiet. The project's vitest run picks the file up via the
`.claudinite/local/packs/**/*.test.mjs` include in `vitest.config.js`, so the checks ship green
in CI.

**When a check's whole point is precision, red-first has to prove it in two directions.** A
violating fixture failing and a clean one passing only proves the shipped check is correct — it
says nothing about whether the parsing it does was *necessary*. So the quiet fixtures are also
run against the naive alternative each piece of parsing exists to avoid, and confirmed to fire
there: a whole-file `new …Event(` grep wrongly flags the `CustomEvent`, never-dispatched and
already-bubbling cases.

## Prose (`RULES.md`)

| Rule (≤5 words) | How enforced |
|---|---|
| quarantine host DOM in one module | prose |
| identify host UI by nets | prose |
| date what selectors were verified against | prose |
| probe reports, never throws | prose |
| mirror the host in a fixture | prose |
| never trust a write; re-read | prose |
| synthetic keystrokes carry real-event fields | prose (its bubbles half is checked) |
| restore borrowed host state; degrade | prose |
| host lifecycle states aren't user actions | prose |
| be inert when off | prose (its observer teardown is checked) |
