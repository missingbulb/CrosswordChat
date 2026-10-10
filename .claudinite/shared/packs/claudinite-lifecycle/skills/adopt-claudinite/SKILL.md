---
name: adopt-claudinite
description: Bootstrap Claudinite into a repo with cn init: packs, questions, workflows, the executor routine, the handover issue. Use when asked to adopt or set up Claudinite.
metadata:
  body: workflow
  usage:
    expect: adoption
---

Adoption is one command and the work it leaves for the session. Everything mechanical is
`cn init`: it pins the newest allowed engine, writes the launcher, the settings, the hooks, the
three workflows and both indexes, vendors the packs with their `requires`, seeds what they seed,
stamps their task secrets into the executor workflow, makes the key request, and ends on three
blocks it prints: QUESTIONS, HANDOVER and NEXT. Never re-create by hand what it wrote.

1. **Run it** from the repo's root, naming the packs the owner chose (`basics` is the usual
   first; it pulls `claudinite-lifecycle` and `git-github`, and the vendored branch's
   `directory.GENERATED.md` lists the rest):

   ```
   npx --yes @claudinite/cli init --packs basics,<id>,...
   ```

   A repo still running the Node engine (it holds `.claudinite-settings.json`) is not adopted
   this way: it is moved, in a session following ClaudiniteEngine's move-member-off-node skill.

2. **Ask every QUESTIONS line in one batched `AskUserQuestion` pass** (up to four per call),
   folding in the instruction-conversion offers below, and record each answer verbatim with
   `cn settings answer <pack>/<question> <text>`. `n/a — none wanted` is an answer; never write
   one on the owner's behalf. A pack added in the same pass (the project-class pack the owner
   picks) may bring questions of its own through its `requires`: adopt it with `cn adopt` and
   ask what that prints, so the interview takes two passes at most. Init exits 0 with questions
   pending; the `adoption-answers-pending` check blocks the commit until they are answered.

3. **Create the executor routine**: `create_trigger` makes it, the SETUP block in its own
   prompt carries the model and repo binding the API cannot set, and its endpoint goes under the
   top-level `tasks.routines` in `.claudinite/settings.*` **before the commit**, so it lands in
   the same pull request. Only the `CCR_ROUTINE_TOKEN` secret is a human's step.

4. **Land one pull request**: commit everything init wrote, with the answers and the endpoint,
   and open it for a person to merge. The world sweep runs in its CI; the Stop hook carries the
   work checks.

5. **File the HANDOVER block as one issue**, a checkbox per row, written per
   [writing-handover-issues](../../../basics/skills/writing-handover-issues/SKILL.md), and link it
   from the pull request. Every row is a setting, an install or a secret no token the session
   holds can write.

**The instructions the repo already has.** A repo adopting usually carries a `CLAUDE.md`, and this
is the moment its rules become carriers instead of being copied into a pack by hand later. In the
same batched pass, ask whether to convert it and whether to trim it afterwards, and - only where
the session can read that the file exists - whether to convert the person's machine-local
`~/.claude/CLAUDE.md` as well. Every yes is the growth pack's `extract-from-instructions`, landing
in this same PR; that skill's routing is what decides which rule is the repo's and which is the
person's, and it never writes the machine-local file.

**Refreshing** an adopted repo is not adoption. Packs and the engine move through the nightly
`engine/update` task, whose pull requests a person merges; to have it run now, wake it through
the scheduler (`actions_run_trigger` on `claudinite-scheduler.yml` at the default branch with
`inputs: { wake: "engine/update" }`) and watch the run to a terminal state. Inside a session,
`cn update packs` proposes the same pack versions.
