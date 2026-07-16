# Testing & CI notes

Project-specific test/CI conventions, layered on the shared Claudinite canon.
Keep entries terse, and only for traps that bite **across files**: a trap you'd
only hit *while editing one test file* goes in that file's own header comment
(e.g. `extension-test/unit/arch.test.js`) — the canon owns this file-local
footgun rule (`.claudinite/skills/lessons-learned/extracting-lessons.md`).

## Prove emergent behavior — don't re-code it

When review raises a "what about scenario X?" behavior question, first check whether
the composed rules **already** produce the right answer before adding production code.
Navigation/dialog behavior here is emergent (`conversation/` is a pure reducer over
several independent rules), so an edge case is often already covered on more than one
count. If it is — e.g. #51: a blank current entry with every *started* entry skipped
walks to the numerically-next blank, because the blank-current tiebreak **and**
skip-memory (REQ-NAV-011) each independently forbid a crossing jump — pin it with a
**regression test** plus an **accept criterion under the relevant REQ** in
`dev/docs/REQUIREMENTS.md`, and change **no** production code. Assert the contrast case
too (without the skips, closeness offers a started entry first) so the test would
actually bite if the rule interaction ever changed. Keep `npm run verify` green (every
Active REQ still covered).
