# node pack

Active when the repo has a root `package.json`. The module-resolution and jsdom gotchas are prose (runtime behaviours with no clean static signature); test discovery is a skill forced onto the files a `node --test` invocation lives in.

## Rules (`RULES.md`)

| Rule | Severity | Reason | Enforcement |
|---|---|---|---|
| A named CJS import can yield undefined | high | correctness | prose: 130 words |
| Node detects ES-module syntax on its own | medium | correctness | prose: 79 words |
| body.innerText is null in jsdom. | medium | correctness | prose: 53 words |
| jsdom parses <noscript> into live DOM | medium | correctness | prose: 52 words |

The `node --test` discovery rule is the [`node-test-discovery`](skills/node-test-discovery/SKILL.md)
skill, forced for `.github/workflows/**` and `package.json`.

## Skills

| Skill | Trigger |
|---|---|
| [`node-test-discovery`](skills/node-test-discovery/SKILL.md) | any edit of `.github/workflows/**` or `package.json` (root or one directory down) — held by the guard until loaded |

## Checks

| Check | Severity | Reason | Enforcement |
|---|---|---|---|
| `node/earn-each-dependency` | medium | complexity | check: advisory |
