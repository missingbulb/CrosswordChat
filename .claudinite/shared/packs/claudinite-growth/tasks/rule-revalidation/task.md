# Rule revalidation — re-probe this repo's local packs

Re-run the probe behind every rule in this repo's **own local packs** that asserts a fact about the
environment — the shape a harness call accepts, what the Action's token may reach, that an MCP tool
exists, how a platform behaves — and correct what no longer holds.

**The corpus is `.claudinite/local/packs/` and nothing else.** A canon pack this repo only mounts
under `.claudinite/shared/` is revalidated in the repo that owns it: the next converge replaces that
tree whole, so an edit there is lost either way.

## The method lives in the skill

How a claim is judged revalidatable, how it is probed, what the four verdicts mean, how an
element's provenance file is reaffirmed and what the run appends to it - and how an empty file met
on the way is filled first - are owned by the [**revalidating-rules**
skill](../../skills/revalidating-rules/SKILL.md). Follow it; don't re-derive it here. This worker
frames the unattended run around it.

## What a run does

1. **Enumerate** every revalidatable claim under the corpus above, by the skill's test. Most of a
   pack is judgment prose and out of scope, so this set is far smaller than the corpus.
2. **Probe each**, per the skill's two probe rules, and record what you ran and what came back.
3. **Correct what is stale**, as far as each probe reaches and no further.
4. **Deliver by the shared procedure — [deliver-pr.md](../../../claudinite-tasks/src/deliver/deliver-pr.md)**.
   Title the commit and the PR `Claudinite growth: rule revalidation`; the commit references the
   tracking issue so the `task-lifecycle` gate passes, and the repo's offline test suite is green
   before you push.
5. **Report every verdict in the PR body** — every claim probed, its verdict and the probe behind it.
   This task rewrites the rules sessions obey, on evidence a reviewer cannot re-derive from the diff,
   so the body carries that evidence in full whether or not anyone reads it. Never bump a pack's
   version or write a `VERSIONS.md` row — both are derived on the base branch after the change lands.
   There is no standing issue.

A run that found everything still true opens no PR at all, and says so in its run log.
