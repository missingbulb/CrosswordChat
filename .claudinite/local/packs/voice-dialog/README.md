# voice-dialog pack (local)

A pack for the **language layer of a spoken interface**: turning what a recognizer heard into an
intent or a piece of content — lexicons of surface phrases, transcript normalization, n-best
candidates, ambiguity — and turning the app's answer back into something worth listening to.
Declared by hand as `local/voice-dialog` in `.claudinite-checks.json`.

**Every rule judges the design of a spoken dialog, not a product decision.** Each one holds for
any app that has one — a voice assistant, an IVR, a dictation surface, an accessibility mode —
and nothing in the check's logic, rationale or fix text is specific to this repo. The scan is
repo-shape agnostic (see below), so the pack cannot pass vacuously green somewhere laid out
differently. This repo is where the rules were *discovered* and is the corpus they are verified
against; it is not what they are about.

**Why local, not a canon declaration:** the mounted canon shelf has no home for this facet — no
canon pack mentions speech at all. `chrome-extension` covers MV3 mechanics, `chrome-extension-release`
release and store publication, and `node`, `github-actions`, `barriers`, `tidy-repo`,
`spec-driven-product` and `executable-requirements` are orthogonal. Nothing here duplicates a
canon rule.

**Why a new local pack rather than a rule in an existing one.** The two sibling local packs bound
this territory on either side and neither owns it:

- `browser-speech` owns the **speech APIs themselves** — where `chrome.tts` may run, mic capture
  and its constraints, endpointing, biasing availability, the recognizer's error taxonomy. Its
  own charter says every rule "judges a browser API contract". Nothing in it is about what the
  words *mean*.
- `host-page-adaptation` owns the **page** the resolved answer is typed into — selectors,
  synthetic input, observers, injected UI.

What sits between them is this repo's pure layer (`extension/src/matching/`,
`extension/src/conversation/`): it imports no browser API and touches no DOM, and it is where a
voice interface is actually won or lost. That is a third facet, so it gets a third pack.

**Provenance:** distilled from this repo's real usage — `matching/commands.js` (the command
lexicon, the number-word map and its live-reported homophones, the `go to` prefix, the gated
fuzzy pass), `matching/normalize.js` (the two normalizations, the crossword number conventions),
`matching/evaluate.js` (n-best expansion with provenance, the explicit caps, ambiguity,
say-then-spell, glued short answers), `conversation/machine.js` (semantic payloads, the silence
timeout) and `conversation/phrases.js` (the single English module, the clue verbalizer), plus the
REQ-ANS, REQ-CMD, REQ-READ and REQ-SPCH requirement families in `dev/docs/REQUIREMENTS.md` and
the live findings recorded inline in `commands.js`. Nothing in it is invented.

**Promotion note:** the check is written to be lifted as-is — repo-shape agnostic scan, no
project identifiers in its logic or messages — so the central promote stage should be able to
move it into a canon `voice-dialog` (or `speech-interfaces`) domain pack with only the `doc:`
path rewritten. The `RULES.md` prose is the part still worth re-reading for project coupling at
promote time: several rules cite this product's measured or domain-specific choices (the
crossword number conventions, the specific expansion caps, "silence gets no comment because this
is a thinking game") as evidence, and those are examples of a category, not constants.

## Checks

| Check | Enforces (≤5 words) | Severity |
|---|---|---|
| `intent-phrases-unique` | no phrase under two intents | blocking |

**Scope.** It scans any source file (`.js/.mjs/.cjs/.ts/.tsx/.jsx`) except test and vendor paths
— never a hard-coded project root. The rule is gated on the lexicon *shape* actually appearing in
the file, so the shape is the trigger and the scan can be repo-shaped; a path scope wired to one
layout would make the rule match zero files and pass vacuously green elsewhere, which is the
worst failure mode a check has. The exclusion that matters is test scaffolding and fixtures: a
test that builds a two-arm lexicon to exercise one branch is not shipping a command grammar, and
a fixture carrying the violation deliberately is the point of the fixture.

**The bug it catches.** A spoken interface recognises intents by their surface phrases, held in a
table that is either **inverted** into a phrase-keyed lookup (`EXACT.set(phrase, intent)`) or
**matched arm by arm** against the utterance (`phrases.includes(norm)`). Both resolve a phrase
listed under two intents by *position* — last writer wins, or first arm wins — and nothing in the
source says which was meant. There is no symptom at the site of the mistake: the table compiles,
every test that says the phrase passes against whichever intent won, and the loss surfaces only
as a user saying a listed phrase and getting the other command. These tables grow by accretion
(every live mishearing gets appended to the arm it was heard for — this repo's `undue`, `a cross`,
bare `anyway`), so the collision typically arrives months after both arms were written, in a diff
that adds one line.

**Parsed, not grepped, where the name alone doesn't decide it.**

The rule judges only a table that is **walked as a lexicon** — a `Object.entries`/`Object.keys`/
`for…in` walk over it whose body feeds a phrase-keyed lookup or an in-order match (`lib.mjs`
`isWalkedAsLexicon`). A table read *by key* is data, not a grammar, and a synonym or expansion
map legitimately repeats its values: this repo's own homophone lookup names every word of a set
under every word of that set, and a check that fired there would be exactly the false alarm that
teaches a team to ignore a check.

It also scopes duplicates **per arm**: the same phrase twice inside one intent's list resolves to
the intent it was always going to resolve to. That is a redundancy, not an ambiguity, and the
rule has no honest opinion about it.

An arm whose array holds anything but string literals (a nested array, an identifier, a computed
value) is skipped rather than guessed at, and a table with fewer than two phrase arms is not a
lexicon at all — one arm cannot collide. Comments are stripped first, so a commented-out arm is
not a live arm.

Red-first fixtures live in `pack.test.mjs`: the rule is run against violating sources in both
consumption shapes (inverted lookup, arm-by-arm match), against clean ones, in TypeScript under a
plain `src/` as well as JavaScript — and then against this repo's real `extension/src/` tree,
which must stay quiet. The project's vitest run picks the file up via the
`.claudinite/local/packs/**/*.test.mjs` include in `vitest.config.js`, so the check ships green in
CI.

**When a check's whole point is precision, red-first has to prove it in two directions.** A
violating fixture failing and a clean one passing only proves the shipped check is correct — it
says nothing about whether the parsing was *necessary*. So the quiet fixtures are also run
against the naive alternative the parsing exists to avoid ("any object-of-string-arrays with a
repeated string anywhere in it") and confirmed to fire there: both the repeat-inside-one-arm case
and the homophone-style synonym map wrongly trip it. And because a rule can also pass by never
reaching real code, the repo case asserts *first* that this repo really does ship three walked
phrase lexicons (`PHRASES`, `CHOICE_PHRASES`, `CONTROLS`) for the rule to judge, and only then
that it is quiet on them.

## Prose (`RULES.md`)

| Rule (≤5 words) | How enforced |
|---|---|
| lexicon records the recognizer's output | prose (its two-intent collision is checked) |
| content needs a command-namespace escape | prose |
| normalize once; compare normalized only | prose |
| use the n-best, keep provenance | prose |
| never resolve ambiguity by picking | prose |
| handle the shapes humans speak | prose |
| say the least that resolves | prose |
| policy has no language in it | prose |
| speak what the eye saw | prose |
