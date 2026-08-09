# Voice dialog — the judgment core

Between the recognizer and the app there is a language layer: a transcript arrives, and
something has to decide whether it was a command or content, whether it can be acted on, and
what to say back. That layer is pure — it touches no speech API and no DOM — and it is where a
voice interface is actually won or lost. The one mechanical rule (no surface phrase listed under
two intents) is this pack's check; what follows is what no check can decide for you.

Each rule is a judgment about spoken interaction, and holds for any app that has one — an
assistant, an IVR, a dictation mode, an accessibility surface. Where one cites this repo — a
file, a requirement id, a live report — that is the **evidence** it was drawn from, not the scope
it applies to. The tuned values are this product's and should be re-measured elsewhere.

The premise underneath all of it: **the transcript is a hypothesis, not an input.** It is
frequently not what the user said, and it never carries the fact that it might be wrong. Every
rule below is about designing for that without making the user pay for it.

## The lexicon is a record of what the recognizer says, not of what people say

Each intent gets a list of surface phrases, and the list is grown from **live sessions**, not
from imagining how a user would phrase it. What goes in is what the recognizer actually emitted:

- `undue` for "undo" (REQ-ANS-017), because that is what comes back;
- `a cross` and `cross` for "across" — a live report recorded that `5 across` never matched while
  `5 down` always did (`matching/commands.js`);
- the number map carries homophones and ordinals — `won`, `to`/`too`, `tree`/`free`, `sex`/`sick`
  for 6, `heaven` for 7, `ate` for 8, `nein`/`nun` for 9 — after small numbers were repeatedly
  missed live;
- a bare `anyway`, because the recognizer often keeps only that word out of "say it anyway"
  (REQ-ANS-012).

None of these could be predicted from the phrasing; all of them are cheap to add once heard. So
treat "the recognizer mangles X" as a **data** problem with a one-line fix in the lexicon, never
as a user-education problem — and never as a reason to reach for fuzzy string distance, which
buys the same recall at the cost of an unbounded number of wrong matches.

Two lexicon shapes, one trap. A table walked to build a phrase-keyed lookup, or matched arm by
arm against the utterance, resolves a phrase listed under **two** intents by table order — the
losing intent is silently unreachable through that wording. That is the `intent-phrases-unique`
check. What the check cannot decide is the case where both readings are genuinely meant: resolve
that in context (the mode the speaker is in, or by asking), never by arm order.

## Content needs an escape hatch out of the command namespace, and commands need a shape content can't take

Every command word is also a thing a user might legitimately be *saying*. Both directions need
an answer:

- Give content an explicit prefix that is always content: `answer …`, `the word is …`, `try …`
  (REQ-ANS-014). Then a user who needs to say "next" as content has a way, and you never have to
  weaken the command match to give them one.
- Where a command's shape is unambiguous, let the shape decide. A trailing "across" can only be
  navigation, so `<garbled> across` is reported as a clue label with an unheard number rather
  than length-checked as the word SIXACROSS — while `… down` and `… cross` stay answer
  candidates, because "falling down" and "red cross" are real answers (`commands.js`).

An explicit prefix (`go to …`) also lets you accept a **partial** parse: whatever follows is a
clue label by construction, so a mangled number becomes "which number?" instead of falling
through into the content pipeline.

## Normalize once, and compare only normalized forms

Comparisons run on a canonical form, produced by one shared module (`matching/normalize.js`), and
every surface phrase in the lexicon is written in that form. Details that turn out to matter:

- Apostrophes are **removed, not spaced** — "we're done" → `were done` — so a listed phrase
  matches whether or not the recognizer punctuated it.
- Two normalizations, deliberately: one for command matching (lowercase, punctuation-free,
  single-spaced) and one for content (uppercase letter tokens). They are different jobs and a
  single "clean the string" helper ends up serving neither.
- Numbers arrive as digits and have to leave as letters, in the **domain's** spoken convention:
  `1984` → NINETEENEIGHTYFOUR, `1905` → NINETEENOHFIVE, `2024` → TWENTYTWENTYFOUR (REQ-ANS-002).
  A generic number-to-words library gets this wrong ("one thousand nine hundred eighty-four"),
  and the convention is the sort of thing only the domain can tell you.

## Use the whole n-best list, and keep each candidate's provenance

The recognizer returns ranked alternatives; taking only the top one throws away the cheapest
signal you have. Feed every alternative through the pipeline and carry two facts with each
candidate: **which alternative** it came from and **how far** it was transformed to get there
(here: how many homophone substitutions — `evaluate.js` `{word, swaps, altIndex}`). Then:

- rank by provenance — earlier alternative first, then fewest transformations — so the reading
  the recognizer was most confident in wins ties;
- report failures from the **top alternative only**, or the user hears a list of things they
  never said;
- and let provenance shape the wording: a homophone respelling sounds identical to the literal
  when read aloud, so naming it would hand the user the "same" word twice — the report gives the
  lengths instead (`phrases.js`, REQ-ANS-007).

Expansion is a cartesian product, so **cap it explicitly** and cap it in three places — options
per token, total combinations, and the number of tokens eligible for expansion at all
(`evaluate.js`, 6 / 64 / 6). Without the third, a long mis-hearing is exactly the input that
explodes.

## Never resolve an ambiguity by picking — say what the choices are

When two readings both fit, the interface asks (REQ-ANS-009): the candidates are spelled out and
the user picks. Guessing is worse than asking here in a way it is not in a GUI — the user cannot
see what you chose, so a wrong guess costs a whole extra turn of confusion before they can even
name the problem.

The same discipline holds for the last-resort pass. A fuzzy scan for a command word buried in a
mis-heard phrase runs **only** after an exact parse and content evaluation have both failed, uses
a deliberately narrow list of words unlikely to appear inside real content, and **returns nothing
when two different commands appear** (`commands.js` `fuzzyCommand`, REQ-ANS-026). A last-resort
rule that guesses is not a last resort, it is a random one.

## Understand the shapes humans actually speak in

People do not utter clean tokens. Three shapes worth handling explicitly, each of which a naive
join gets wrong:

- **Say it, then spell it** — "dog, D, O, G" in one breath. Concatenated it reads as DOGDOG.
  Detect a trailing run of spoken letters that spells the leading word (or one of its
  expansions, so "gray, G, R, E, Y" still resolves) and treat the utterance as one word
  (REQ-ANS-022).
- **All letters, no mode** — an utterance that is nothing but spoken letters (bare, letter names,
  NATO) is a spelled word whether or not a spelling mode was entered (REQ-ANS-020). Strict
  all-or-nothing: one non-letter token and the reading is off.
- **Glued short answers** — two letters said quickly come back as one token (`OD`), which no
  letter parser reads. When the utterance is a single alphabetic token exactly as long as the
  gap it would fill, split it back into letters rather than reporting the maddening "OD is 2, we
  need 4" (`evaluate.js`).

## Say the least that resolves the turn

Speech is serial and slow, and the user cannot skim it. Every word you speak is time they cannot
get back, so the default is terse and the exceptions are earned:

- Don't echo what they just said — the acknowledgement is `Fits!`, not "I heard HEART, and HEART
  fits" (REQ-ANS-006). The word is spelled back **only** when the accepted spelling differs from
  what they voiced.
- A failure report is the problem and nothing else: no "I heard…" preamble, no usage coaching
  (REQ-ANS-007).
- When there are many problems, give the first in full and the rest as a count — "the third
  letter is already E, and 2 more clashes" (REQ-ANS-008).
- Name a recurring failure **once**, not per occurrence — a burst of unfinalized speech says "I'm
  having trouble hearing over the background noise" one time (REQ-SPCH-012).

Silence is also a message, and usually the right one: this is a thinking game, so a long pause
gets no comment at all (`machine.js` `SILENCE_TIMEOUT_MS`).

## Keep the policy free of language, and the language in one file

The dialog policy is a pure reducer emitting **semantic payloads** (`{kind: 'collision', word,
collisions}`), and one module renders those to English (`conversation/machine.js` →
`conversation/phrases.js`, REQ-NFR-005). Three things fall out, and all three are the reason to
do it:

- the policy is testable without speech, without a browser, and without asserting on prose;
- every word the product says is reviewable — and re-tunable for terseness — in one file;
- a payload kind the renderer doesn't know degrades to spoken text instead of crashing the turn.

## Speak what the eye would have seen

Reading a visual artifact aloud is a translation, not a transcription: the formatting carries
meaning that vanishes when the characters are read out. Announce it in words instead
(`phrases.js` `verbalizeClue`):

- emphasis becomes a sentence — "The word 'house' is in italics" (REQ-READ-002);
- runs of underscores become the word "blank" (REQ-READ-005);
- enclosing brackets are announced, not pronounced (REQ-READ-003);
- a trailing question mark is **said aloud**, because intonation alone is voice-dependent and the
  cue is load-bearing in this domain (REQ-READ-004);
- an all-caps word is title-cased before it is spoken, or the engine reads it as an acronym; and
  a word meant to be heard letter-by-letter is joined with commas ("H, E, A, R, T").

And announce only what earns its time: whole-clue quoting is announced, partial quotes are not —
they are too common to be worth a sentence each (user feedback, `phrases.js`). What to translate
is a judgment about frequency, not a completeness exercise.
