# node pack

Active when the repo has a root `package.json`. Prose-only (the module-resolution and jsdom gotchas are runtime behaviours with no clean static signature).

## Rules (`RULES.md`)

| Rule | Severity | Reason | Enforcement |
|---|---|---|---|
| A named CJS import can yield undefined | high | correctness | prose: 130 words |
| Node detects ES-module syntax on its own | medium | correctness | prose: 79 words |
| node --test skips dot-directories | critical | correctness | prose: 148 words |
| body.innerText is null in jsdom. | medium | correctness | prose: 52 words |
| jsdom parses <noscript> into live DOM | medium | correctness | prose: 51 words |

## Checks

| Check | Severity | Reason | Enforcement |
|---|---|---|---|
| `node/earn-each-dependency` | medium | complexity | check: advisory |
