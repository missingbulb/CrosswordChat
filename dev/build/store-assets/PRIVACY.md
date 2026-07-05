# CrosswordChat Privacy Policy

**Effective date: July 5, 2026**

CrosswordChat is a Chrome extension that lets you solve the New York Times crossword by
voice: it reads clues aloud and types the answers you speak. This policy explains what the
extension does with data. The short version: **it collects nothing, transmits nothing, and
stores nothing except your own settings.**

## What the extension does NOT do

- **No servers.** The extension makes no network requests of its own — no backend, no
  APIs, no accounts, no analytics, no crash reporting, no remote configuration. This is
  enforced by an automated architecture test in the codebase (no network primitives may
  appear in extension source).
- **No collection.** Your voice, the recognized transcripts, the puzzle, your answers, and
  your solving progress are never collected, logged, or sent anywhere by the extension.
- **No persistence of puzzle or speech data.** Clues, answers, and transcripts live only in
  the memory of the puzzle tab while a voice session is active and are gone when the
  session ends or the tab closes.
- **No sale or sharing of data.** There is nothing to sell or share.

## What the extension processes, and where

- **Microphone audio.** When you start a session (by clicking the toolbar icon) the
  extension listens for your answers using the browser's built-in Web Speech API
  (`webkitSpeechRecognition`). Audio is captured only during an active session, only on
  the crossword page, and only after you grant Chrome's microphone permission.
  **Note:** Chrome's default speech recognition is a browser feature that may process
  audio on Google's speech servers; that processing is performed by Chrome itself under
  [Google's privacy policy](https://policies.google.com/privacy), not by this extension.
  Recent versions of Chrome can perform recognition on-device.
- **Speech output.** Clues are spoken with Chrome's text-to-speech engine (`chrome.tts`),
  which runs locally in the browser.
- **Puzzle content.** The extension reads the clues and grid of the New York Times
  crossword page you have open (its only host permission is `https://www.nytimes.com/*`)
  and simulates keystrokes to enter your answers. This happens entirely inside your
  browser.

## What the extension stores

One thing: your **settings** (for example, the clue-selection strategy chosen on the
options page), kept in `chrome.storage.sync` so they follow your Chrome profile. Settings
contain no personal information, no audio, and nothing about any puzzle. Uninstalling the
extension removes them.

## Permissions, explained

| Permission | Why it is needed |
|---|---|
| `tts` | Speak clues and feedback aloud. |
| `storage` | Save your settings (and nothing else). |
| Host access to `https://www.nytimes.com/*` | Read clues from, and type answers into, the NYT crossword page. The extension runs nowhere else. |
| Microphone (requested by the page at session start) | Hear your answers. Active only during a session you started. |

## Children

The extension does not knowingly collect information from anyone, including children.

## Changes

If the extension's behavior ever changes in a way that affects this policy, the policy will
be updated here (this document is version-controlled in the public repository) and the
extension's store listing will be updated before release.

## Contact

Questions or concerns: open an issue at
[github.com/missingbulb/CrosswordChat](https://github.com/missingbulb/CrosswordChat/issues)
or use the developer contact email shown on the Chrome Web Store listing.
