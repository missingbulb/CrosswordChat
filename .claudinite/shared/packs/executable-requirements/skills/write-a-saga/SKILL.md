---
name: write-a-saga
description: How a saga case is written — a multi-step story captured as a golden storyboard or one animated APNG golden — steps, captions, frame budget, the real entry point, delay stripping and gesture marking. Use when authoring or changing a case under the saga kind.
metadata:
  force-load-on-file-edits-paths:
    - "dev/requirements/saga/**"
---

# Writing a saga

Single frames prove states; **sagas prove transitions and causality** — what arriving, acting, or
time passing *changes*. Use a saga when the requirement is the story ("a message sent before I
arrived never appears; one sent after I arrived does"), not decomposable into independent resting
states without losing the claim.

- A saga case is an ordered list of **steps**; each step = a caption plus an action against the
  fake world; after each step the runner captures one golden frame `<slug>.<id>.step-NN.png`.
- The **caption narrates the story** in user terms — captions surface in the gallery.
- One saga = one leaf; the frames are that one case's expected (all frames pixel-exact, same
  ownership rules as any golden). Keep sagas to 3–6 frames; a longer story is usually two sagas.
- Saga steps drive the **same real entry point** as every other kind (the shipped app shell/render
  function) — a saga must never become a scripted slideshow of hand-arranged states.

## Animated saga goldens

Recording the motion, not the frames. A per-step frame proves a resting state; a saga can instead
be **one animated golden** — an APNG per leaf — recording the real UI *moving* between steps. What
keeps it delay-free and deterministic:

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
