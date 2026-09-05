---
name: deterministic-expecteds
description: What makes a rendered expected byte-stable — the pinned clock, faked inputs, real fonts, fixed-duration pumps — and the per-stack rendering recipe (jsdom+satori for DOM products, Flutter golden files) with pixel-exact comparison. Use when writing a case, the render harness or the fake world under dev/requirements.
metadata:
  force-load-on-file-edits-paths:
    - "dev/requirements/**/cases/**"
    - "dev/requirements/shared/**"
---

# Deterministic expecteds

## Determinism or it isn't spec

A rendered expected is only owner-ownable if it is byte-stable forever:

- **Pin the clock.** One shared reference time (`REFERENCE_NOW`) threaded to everything that
  formats or compares dates; fixture data is authored relative to it. Never wall-clock.
- **Fake every nondeterministic input**: network (map tiles, avatars — deterministic generated
  substitutes), randomness, platform sensors, locale (pin it; date copy is locale-sensitive),
  viewport (one fixed logical size and pixel ratio).
- **Load real fonts** in the render harness — test environments default to a glyph-less stub that
  renders text as boxes. Load the product's bundled families plus the
  icon font; watch for styles that don't inherit the family (button text styles are the classic
  leak) — pin the family there explicitly.
- **Never wait for "settled".** Indeterminate spinners animate forever; use fixed-duration pumps
  so an in-flight state is a capturable, deterministic frame.

## Rendering recipes per stack

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
