# Chrome Web Store listing — copy-paste answers

Everything the developer dashboard asks for when creating/updating the CrosswordChat
listing, pre-written. Dashboard: https://chrome.google.com/webstore/devconsole
(one-time $5 developer fee; the publisher account needs a verified contact email and
two-factor authentication).

Graphic assets live alongside this file in `dev/build/release/store_artifacts/`; regenerate any of
them with `node tools/make-store-assets.mjs` (icons land in `extension/icons/` and ship
inside the zip automatically).

Keep this file current: a PR that changes the manifest's permissions updates the justification
table below in the same PR (canon release guide, "When a change touches the extension's
permissions").

---

## Store listing tab

**Name** (from the uploaded manifest): `CrosswordChat`

**Summary** (from the manifest `description`, ≤132 chars):

> Solve the New York Times crossword conversationally: it reads clues aloud, you answer by voice.

**Detailed description** (plain text; paste as-is):

```
Solve the New York Times crossword without touching your keyboard. CrosswordChat reads
each clue aloud — "Little house. 6 letters." — listens for your answer, checks it, types
it into the grid, and moves on to the next clue. Solve the whole puzzle in one spoken
conversation while you cook, fold laundry, or rest your eyes.

WHAT IT DOES WELL
• Lives where you solve: a speech-bubble button right in the NYT puzzle toolbar, next to
  the pencil. One click and you're talking. (The extension icon works too — and it grays
  out on pages CrosswordChat doesn't support, so you always know where it can help.)
• Reads clues the way a friend would: italics, quotes, brackets, "blank" for ___, and the
  answer length, every time.
• Understands you, not just your words: homophone-aware matching ("roe" vs "row"),
  digits spoken as words, an n-best list from the recognizer so a near-miss still lands.
• Checks before it types: answer length, letters already on the grid from crossing words,
  conflicts announced out loud — you decide whether to overwrite.
• A real conversation: say "next", "pass", "back", "flip", "undo", "repeat", "hint",
  "spell it", "help", or correct it with "I said …". Interrupt it mid-sentence — it
  listens while it speaks. Say "goodbye" to end the session.
• Picks the next clue intelligently (easiest-first, most-filled-first, or list order —
  your choice in the settings popup), and celebrates when the puzzle is done.

PRIVATE BY DESIGN
No servers, no accounts, no analytics. The extension makes zero network requests of its
own — speech recognition and text-to-speech are Chrome's built-in engines, and nothing
you say or solve is ever recorded or stored. The only thing it saves is your settings.
Full policy: https://missingbulb.github.io/CrosswordChat/privacy/

HOW TO USE IT
1. Open a New York Times crossword — the Mini, the Midi, or the daily (the free Mini works).
2. Click the speech-bubble button next to the pencil in the puzzle toolbar (or the
   extension icon) and allow the microphone.
3. Talk. Click the button again (or say "goodbye") to stop.

Not sure whether a page is supported? The extension icon is in color where CrosswordChat
works and gray where it doesn't — and clicking it on an unsupported page explains why,
with a support address (crosswords@missingbulb.com) if you've found a crossword we
should cover next.

Requires Chrome 116+. Works only on nytimes.com crossword pages — it stays completely
inert everywhere else. Not affiliated with or endorsed by The New York Times.
```

**Category:** Accessibility
**Language:** English (United States)

**Graphic assets:**

| Dashboard field | File |
|---|---|
| Store icon (128×128) | `extension/icons/icon-128.png` |
| Screenshot 1 (1280×800) | `dev/build/release/store_artifacts/screenshot-1-1280x800.png` |
| Screenshot 2 (1280×800) | `dev/build/release/store_artifacts/screenshot-2-1280x800.png` |
| Small promo tile (440×280) | `dev/build/release/store_artifacts/promo-small-440x280.png` |
| Marquee promo tile (1400×560, optional) | `dev/build/release/store_artifacts/promo-marquee-1400x560.png` |

**Additional fields:**

- Official URL / homepage: `https://github.com/missingbulb/CrosswordChat`
- Support URL: `https://github.com/missingbulb/CrosswordChat/issues`

---

## Privacy practices tab

**Single purpose description:**

> CrosswordChat's single purpose is to let the user solve the New York Times crossword by
> voice: it reads the puzzle's clues aloud via text-to-speech, listens to the user's
> spoken answers via speech recognition, verifies them against the grid, and types them
> into the puzzle page.

**Permission justifications:**

| Permission | Justification to paste |
|---|---|
| `tts` | Speaks crossword clues and feedback aloud with Chrome's text-to-speech engine. Voice output is the extension's core interface — its only visual UI is the start/stop button in the puzzle toolbar and a static informational popup on unsupported pages. |
| `storage` | Stores the user's settings (the clue-selection strategy and reading speed chosen in the settings popup) in chrome.storage.sync. No other data is ever stored. |
| Host permission `https://www.nytimes.com/*` | The extension works exclusively on the New York Times crossword: content scripts read the clues and grid from the puzzle page and simulate keystrokes to enter the user's spoken answers. It is inert on every other site and requests no other host. |

**Remote code use:** No — all code is packaged in the extension bundle. No remote scripts,
no eval, no CDN resources, no server of any kind (enforced by an automated architecture
test in the repository).

**Data usage — what user data do you plan to collect?** Check **nothing**. The extension
does not collect or transmit any user data: it has no servers and makes no network
requests. Microphone audio is processed transiently by Chrome's built-in Web Speech API
(a browser feature) solely to produce a transcript in the page's memory; the extension
never records, stores, or transmits audio, transcripts, or puzzle content. The only
persisted data is the user's own settings object in chrome.storage.sync, which contains
no personal or web-history information. (This behavior is enforced by architecture tests:
no network primitives in source, storage APIs allowed only in the settings module.)

**Certifications** (check all three):

- [x] I do not sell or transfer user data to third parties, outside of the approved use cases
- [x] I do not use or transfer user data for purposes that are unrelated to my item's single purpose
- [x] I do not use or transfer user data to determine creditworthiness or for lending purposes

**Privacy policy URL:**

```
https://missingbulb.github.io/CrosswordChat/privacy/
```

---

## Distribution tab

- **Payments:** Free of charge
- **Visibility:** Public
- **Distribution regions:** All regions

---

## Notes for the Google reviewer (paste into the review notes field if offered)

```
Testing requires a microphone and a New York Times crossword page. The free NYT Mini
works without a subscription: https://www.nytimes.com/crosswords/game/mini
Open it and click the speech-bubble button that appears right of the pencil in the
puzzle toolbar (the extension's toolbar icon does the same thing); grant the microphone
permission and speak an answer or a command ("help" lists them). Click the button again
or say "goodbye" to stop. On pages that are not a supported NYT crossword, the action
icon turns gray and clicking it shows a small static popup explaining where the
extension works; no other UI exists. The extension runs only on nytimes.com and makes
no network requests of its own.
```

---

## Submission checklist

1. [ ] Developer account ready: $5 fee paid, contact email verified, 2FA on.
2. [ ] Get a zip: download the
       [latest release zip](https://github.com/missingbulb/CrosswordChat/releases/latest/download/crossword-chat.zip),
       or `npm run build` (→ `dist/crossword-chat.zip`, manifest at zip root).
3. [ ] Dashboard → **New item** → upload the zip.
4. [ ] Fill the three tabs from this document (listing, privacy, distribution).
5. [ ] Upload the five graphic assets.
6. [ ] Submit for review; expect hours-to-days (microphone use can draw extra scrutiny —
       the review notes above preempt the questions).
7. [ ] Copy the item ID into the `CHROME_EXTENSION_ID` repo secret and finish issue #4 so
       future releases deploy automatically.
