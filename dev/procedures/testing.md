# Testing & CI notes

Project-specific test/CI conventions, layered on the shared Claudinite canon.
Keep entries terse, and only for traps that bite **across files**: a trap you'd
only hit *while editing one test file* goes in that file's own header comment
(e.g. `extension-test/unit/arch.test.js`) — the canon owns this file-local
footgun rule (`.claudinite/skills/lessons-learned/extracting-lessons.md`).
