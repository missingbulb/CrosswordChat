# usage-review

Daily, deterministic, and it changes nothing it reviews.

Every skill the repo mounts declares what usage it expects of itself, in its
frontmatter `metadata.usage` block. The [usage fold](../../../claudinite-tasks/tasks/usage-fold/README.md)
records what actually happened. This task compares the two, by a file of rule
declarations rather than by code, and writes what it found.

## What it writes

`.claudinite/local/usage-review.GENERATED.json`, on one accumulating pull request
that merges only when a person merges it:

| | |
|---|---|
| `window` | both windows' bounds, how many days of record each holds, and how many subjects were judged |
| `findings` | one per (rule, subject): the figures both windows carried, how well the cause is known, the possible causes in order, the sentences a person reads, and `since` - the first review it appeared in |
| `notEvaluated` | the rule/subject pairs held back by a floor, with the figure that fell short. *No findings* means something only when this is empty |
| `unstated` | the skills declaring no expectation. Only *always loaded* is evaluated for those, and the list is the nudge to declare |

Beside it, `.claudinite/local/dashboard/claudinite-growth.GENERATED.json` - the
values for the two widgets [dashboard.json](../../dashboard.json) declares.

## The rules

[`usage-rules.json`](../../usage-rules.json), validated by its own schema, each rule
readable as a sentence: *over these subjects, in this window, above this floor, when
this holds, the cause is this well known, and this is what it usually means.* A local
pack may add its own in the same vocabulary. There are no coded rules - a gate the
vocabulary cannot express is not a rule.

A rule's `cause` says what its recommendation is worth. `known` means the arithmetic
or the mechanism leaves one cause; `probable` means one is likeliest; `unknown` means
the finding is evidence and nothing more.

## When it runs

Daily, after the fold, and only when the fold has moved past what the last review
read and the window holds at least ten sessions - under that, a rate says more about
the window than about its subject.

## What happens to a finding

It appears in the file and on the dashboard. If it is still there two weeks later and
its cause is `known` or `probable`, the review files one `usage-finding` issue for it,
updates that issue while the finding persists, and closes it with the clearing figures
the day it goes. A finding with an `unknown` cause never files.

Proposing a change is a different task: [usage-triage](../usage-triage/README.md)
reads the lasting findings and opens a pull request carrying the edit itself, which
the owner merges or declines.
