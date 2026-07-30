# node pack

Active when the repo has a root `package.json`. Prose-only (the module-resolution and jsdom gotchas are runtime behaviours with no clean static signature).

## Prose (`RULES.md`)

| Rule (≤5 words) | How enforced |
|---|---|
| Named CJS import may be undefined | prose |
| Node detects ESM; no package.json | prose |
| jsdom body.innerText is null | prose |
| jsdom parses noscript into DOM | prose |
