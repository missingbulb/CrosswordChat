# node pack

Active when the repo has a `package.json` at its root or one directory down.

## Environment (`env`)

A cloud session gets the dependencies installed in each directory the pack entry's `config.dirs`
lists, and in the repo root when it lists none:
`{ "id": "node", "config": { "dirs": ["firebase/functions"] } }`. A directory with a lockfile
gets `npm ci`; one without gets `npm install`, which writes no lockfile. A `package.json` that
declares no dependencies needs nothing installed, so it passes with no `node_modules`.

## Rules (`RULES.md`)

| Rule | Severity | Reason | Enforcement |
|---|---|---|---|
| A named CJS import can yield undefined | high | correctness | prose: <200 words |
| Node detects ES-module syntax on its own | medium | correctness | prose: <100 words |
| A scratchpad script can't reach node_modules | medium | correctness | prose: <100 words |
| Check what Node version CI pins | medium | correctness | prose: <100 words |
| Declare setup-node caching either way | medium | performance | prose: <100 words |
| A printing script must not process.exit() | high | correctness | prose: <50 words |
| body.innerText is null in jsdom. | medium | correctness | prose: <100 words |
| jsdom parses <noscript> into live DOM | medium | correctness | prose: <100 words |

## Skills

| Skill | Trigger |
|---|---|
| [`node-test-discovery`](skills/node-test-discovery/SKILL.md) | any edit of `.github/workflows/**` or `package.json` (root or one directory down) — held by the guard until loaded |

## Checks

| Check | Severity | Reason | Enforcement |
|---|---|---|---|
| `node/earn-each-dependency` | medium | complexity | check: advisory |
| `node/btoa-atob-on-text` | high | correctness | check: advisory |
| `node/test-discovery-resolves` | high | correctness | check: blocking |
