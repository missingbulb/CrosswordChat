# Prose-to-checks — sweep this repo's pack prose

Mine the **existing** prose of this repo's packs — each pack's `RULES.md` / `SKILL.md` — for
always-testable rules that were never converted to checks, and convert the strongest ones. Work the
*backlog* only: prose this run's siblings already wrote is [growth-extract](../growth-extract/task.md)'s
own upgrade pass, not this sweep's.

**The corpus is `.claudinite/local/packs/` and nothing else** — this repo's own local packs. A canon
pack it only mounts under `.claudinite/shared/` is swept in the repo that owns it: the next converge
replaces that tree whole, so an edit there is lost either way.

Convert prose to checks in a single PR.

## The method lives in the skill

The conversion method — how to spot an always-testable rule in prose, judge convertibility, author the check plus its **see-it-fail** fixture, and decide what stays prose — is owned by the [**prose-to-checks** skill](../../skills/prose-to-checks/SKILL.md). Follow it; don't re-derive it here. This worker only frames the unattended run around it.

## What a run does

1. **Pick convertible prose** under the corpus above — rules that govern **how we work** (not what the product does — see the skill's first gate), that are *always testable* (a deterministic condition a check could assert), and that no existing check already covers. Prefer the strongest, clearest candidates; converting one or two solid rules well beats churning many shakily.
2. **Convert per the skill** — author the rule module in its owning pack, register it in that pack's `pack.mjs`, and add a **fixture test that fires on a violating input and stays quiet on a clean one** (see-it-fail is mandatory — a check that can't be made confident is left as prose, never shipped broken). Then apply the skill's **deletion test** to the prose the check now stands beside — a paragraph the check fully covers is deleted whole, never trimmed.
3. **Deliver on the branch and pull request your item names** — push this round to `Target-branch:`, and onto `Target-pr:` where one is named: the round then joins the review already pending, so a reviewer who has not got to last week's work reads one PR, not three. Where none is named, open the pull request on that branch under the title `Claudinite growth: prose to checks`. Never search for an open pull request or pick a branch of your own. Either way the commit references the tracking issue so the `task-lifecycle` gate passes, and the repo's offline test suite is green before you push.
4. **Say what converted in the PR body** — the prose converted and the check id it became, per conversion. That, and the commit, are the record; there is no standing issue. Never bump a pack's version or write a `VERSIONS.md` row — both are derived on the base branch after the change lands.

## What this task must never do

- **Never ship a check that can't be made confident** — the see-it-fail fixture is the gate; an unprovable rule stays prose.
- **Never convert a rule an existing check already covers** — dedupe against the check set first.
- **Never convert a statement of what the product does** — a rule asserting which entities exist, what a surface renders, or that a feature's parts are wired together is a **requirement**, and belongs in the project's executable spec and the suite that proves it. Such a rule is testable, so it passes the check-the-world test on its own; the skill's first gate is what stops it. Found in pack prose it is already mis-homed — leave it and log it, never cement it as a check.
- **Never write outside `.claudinite/local/packs/`** — not the canon mounted under `.claudinite/shared/`, not a `packs/` shelf this repo may keep of its own, not the project's own code.
- **Judging convertibility and authoring checks + fixtures is heavy judgment** — a check that reds on correct work costs every session in the repo, so convert only what you can prove.
