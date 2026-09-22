# usage-triage

Weekly, and the only stage of the usage loop that changes anything.

The [usage review](../usage-review/README.md) compares what each skill declares
about its own usage against what the record shows, and changes nothing. This task
reads the findings that have stood two weeks with a cause a diff can argue from,
and proposes the change - one pull request per subject, carrying the edit itself
rather than a description of it, with automerge `nothing`.

The owner merges it or declines it.

## Scope

`.claudinite/local/packs/` - this repo's own packs. A finding about a subject that
arrived from a canon is evidence for whoever maintains that shelf, not this repo's
to change.

## When it runs

Weekly, and only when a finding has lasted. A week with none opens no session at
all, which is what bounds the cost of the one agentic stage in the loop.

## What lands

The edit, and the element's provenance entry for it in the same diff - so the log
entry merges only if the change does. That entry's `Source` names the usage rule by
id and the finding's issue by number, with the figures it was read from.
