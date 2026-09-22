# claude-code-web-users-support pack

What a project can offer the people working on it **from the web** — a Claude Code web session runs
for a signed-in person in a managed container, and a terminal session does neither, so this is where
the capabilities that depend on knowing *who* is here — or on the managed container they get —
live. Today that is two: the pack each person brings with them, copied into the repo by
[`session-prepare.mjs`](session-prepare.mjs) from a configured store repo; and
[`environment-setup-command.sh`](environment-setup-command.sh), the generic body a project pastes
into its web environment's **Setup script** field so the image carries the toolchains the base image
doesn't ship. The script's content is the same for every project — it just runs every active pack's
declared `env` install through the engine's `env-requirements.mjs`, so it never changes as
requirements do (bootstrap.md Part 9 walks the setup). Nobody has to go looking for that body:
the pack's `adoptionHandover` step has the filing session quote it inline, so the issue asking
for the paste carries the block to copy.

Declared, and seeded by `--init`. The pack holds an **address**, not the content: `config.repo` (and
an optional `config.path`, default `preferences`) name the store that holds one `<email>/` directory
per person.

## The pack a person brings

`<path>/<email>/` in the store is an ordinary pack directory - `RULES.md`, optional `pack.mjs`,
`skills/<name>/SKILL.md`, `worldRules/`, `declared-checks.json`, `provenance/`. At session start
[`copy_user_pack_to_repo.mjs`](copy_user_pack_to_repo.mjs) copies it into
`.claudinite/temp/packs/current_user/`, the engine's session pack root, where the same loader that
reads the canon and the repo's own packs picks it up: its rules ride the memory channel through the
rules index, its skills are mounted, its checks run. So a person is not limited to stating
preferences - anything a pack can carry, they can carry.

The copy runs only in an **attended** session: a routine fired under a person's account carries
their identity but not their presence, and the harness's attended flag is what the step reads. Every
miss - unattended, no identity, no configured store, no directory, a clone that fails - leaves the
directory holding a placeholder, and [`session-start.mjs`](session-start.mjs) turns that into one
plain-text note before the session proceeds on default interaction behaviour. Reading is
local-first: when this repo *is* the store, the working copy wins over the default branch, so an
edit in progress is what the session sees. Otherwise the store is reached by a shallow,
blob-filtered, sparse `git clone` of that one directory.

Being the store also constrains the tree: the directory name is the whole address, so each one is
one person's exact identity, which [`worldRules/store-file-names.mjs`](worldRules/store-file-names.mjs)
explains and audits.

**The store is as trusted as this repository.** A person's pack is executable code - checks and
hooks that run inside every session it is copied into - so write access to a person's directory is
the power to run code in their sessions. Protect the store's `<path>/` with branch protection or
per-directory code owners.

What a person's pack carries is **personal, not project conventions**: conventions belong to the
packs that own each subject and load as prose, while these travel with a person across every project
they work in, and two people on one project can want different things.

## Rules (`RULES.md`)

| Rule | Severity | Reason | Enforcement |
|---|---|---|---|
| Changing a person's rules | medium | complexity | prose: <100 words |
| A person's first personal pack | high | correctness | prose: <50 words + check (`preferences-store-file-names`) |
| A person wanting more than rules | medium | complexity | prose: <100 words |
| A web session's missing toolchain | medium | complexity | prose: <50 words |

## Checks

All three are advisory: a personal pack is a nice-to-have, and nothing here may block a session.

| Check | Severity | Reason | Enforcement |
|---|---|---|---|
| `preferences-store-configured` | medium | complexity | check: advisory |
| `preferences-store-file-names` | high | correctness | check: advisory |
| `preferences-provenance` | low | complexity | check: advisory |
