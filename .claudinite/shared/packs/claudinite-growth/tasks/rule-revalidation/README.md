# rule-revalidation

## Why the declaration reads as it does

Carried over from the declaration's comments when it became `task.json`.

claudinite-growth task: rule-revalidation — re-probe the pack rules whose
truth lives OUTSIDE this repo. A rule saying "the harness rejects X", "the
Action's token cannot reach Y", "MCP tool Z exists" was true of the environment
on the day it was written, and nothing in the repo goes red when the platform
moves under it: the prose stays green, sessions keep following it, and the cost
lands as a session spent on a path that closed months ago. This task re-runs the
probe behind each such claim and corrects what no longer holds.

Scope is `.claudinite/local/packs/`, and no config widens it. Every pack's
claims are re-probed in the one repo that can fix them: a member's own local
packs here, a canon pack's by the canon-curation task that owns the shelf. A
member editing a rule it merely mounts would lose the edit at the next converge
anyway.

The claims are about the world, but a repo nobody works in has nothing riding
on them: the sweep sleeps while it is silent and resumes on the first active
window. Which pack paths it revalidates is task.md's.

The `automerge` scope is the repo's own Claudinite tree, `under:.claudinite/local` —
any change of any kind inside it, because this task's write surface is wider
than prose: a disproved premise takes its check and its fixture with it, and a
claim whose surface is gone takes its file. The canon shelf is covered by no
term, so a run that corrected a pack this repo publishes to others parks for the
owner — those rules reach every member, and the probe evidence a reviewer reads
is the one thing the diff does not carry.

Never narrow this to a movement gate: the repo does not move when its claims
expire, so movement is exactly the wrong evidence. And never gate on the
previous round still being open — the round runs and appends to that PR, which
is what makes one review cover several weeks of corrections.
