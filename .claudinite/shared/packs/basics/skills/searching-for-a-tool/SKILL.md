---
name: searching-for-a-tool
description: Finding a harness tool by name — the select form for a deferred tool, and what an empty search means. Use before any ToolSearch, and when a search finds nothing.
metadata:
  force-load-on-tool-calls:
    - 'ToolSearch'
  force-load-on-tool-results-matching:
    - 'ToolSearch /no (matching )?tools/i'
---

# Searching for a tool

- **A search that finds nothing** is evidence about your query, not about the environment: vary
  the query before concluding a capability is absent, and try the tool before telling the owner a
  step is theirs.
- **`select:` takes a short name as readily as a qualified one** — `select:get_teams` and
  `select:mcp__github__get_teams` both return the tool, and a comma-separated list loads several at
  once. Qualify a name two servers could both carry. (1)
- **A bare short name is a keyword query, and resolves too** — `get_teams` on its own returns the
  tool, ranked above the looser matches beneath it.
- **A server whose whole roster the deferred-tools listing already names** is the one exception: one
  miss there is the answer, so read the roster rather than rephrase the query.
