# node pack

Active when the repo has a root `package.json`. Prose-only (jsdom gotchas have no clean static signature).

## Prose (`RULES.md`)

| Rule (≤5 words) | How enforced |
|---|---|
| jsdom body.innerText is null | prose |
| jsdom parses noscript into DOM | prose |
