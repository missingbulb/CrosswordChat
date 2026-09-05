# Executable requirements — the framework standard

## 1. The layout is the contract

- Everything lives under **`dev/requirements/`**: `requirements.md` (the numbered prose spec),
  one **top-level folder per kind**, `shared/` for cross-kind infra, and the runners/gates. The
  spec file's path is the framework's structural fingerprint — this pack activates on it.
- **The folder is the kind.** A case's kind is the directory it lives in; the case declares no
  kind field. Cases are
  `<kind>/cases/<slug>.<leaf-id>.case.<ext>`: a stable feature slug (so retitling a spec section
  never forces renames), then the dotted leaf id.
- **Artifact expecteds live beside their case** (`<slug>.<id>.png`, `expected/<name>.json`);
  failure artifacts (actual/diff renders) go to a gitignored dir, never beside the goldens.

## 2. The gallery is derived output

- The spec doubles as a visual gallery: under every image-kind leaf, machine-managed image lines
  (tagged with an HTML comment marker) embed the committed goldens — saga leaves get their full
  captioned storyboard strip.
- A committed **gallery gate** keeps the doc equal to the generator's output byte-for-byte.
  Regenerate via the tool, never by hand.

## 3. Refresh is a review step

One committed refresh entry point regenerates all goldens **and** the gallery together, so they
cannot skew. Running it is how an *intended* UI change lands — the refreshed PNGs ride the diff
for the owner to approve. It is never how a red case gets fixed: the re-baselining approval
procedure (surface actual/expected/diff, ask, only then re-baseline) is canon in the
writing-tests skill and the spec-driven-product playbook.
