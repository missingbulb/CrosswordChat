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
an optional `config.path`, default `preferences`) name the store that holds one `<login>/` directory
per person, named for their GitHub login in lower case.

## Who the person is

The harness names a web session's person by email only, so the prepare step reads the GitHub
login back from `GET /user` with the session's own token, `GH_TOKEN` and then `GITHUB_TOKEN`
([`read_github_login.mjs`](read_github_login.mjs)). GitHub compares logins case-insensitively and
directory names don't, so the store holds the login in lower case and the reader lowercases what
the API returns. The token names whoever it was minted for: an environment that puts a shared or
bot token in either variable makes every person in it that account.

The session-start note names the login used and the directory copied, or why nothing was.

## The pack a person brings

`<path>/<login>/` in the store is an ordinary pack directory - `RULES.md`, optional `pack.mjs`,
`skills/<name>/SKILL.md`, `worldRules/`, `declared-checks.json`, `provenance/`. At session start
[`copy_user_pack_to_repo.mjs`](copy_user_pack_to_repo.mjs) copies it into
`.claudinite/temp/packs/current_user/`, the engine's session pack root, where the same loader that
reads the canon and the repo's own packs picks it up: its rules ride the memory channel through the
rules index, its skills are mounted, its checks run. So a person is not limited to stating
preferences - anything a pack can carry, they can carry. The step also writes
`.claudinite/temp/.gitignore`, so what it copies never shows up as a change to commit, whatever
the repo's own `.gitignore` says.

The copy runs only in an **attended** session: a routine fired under a person's account carries
their identity but not their presence, and the harness's attended flag is what the step reads. Every
miss - unattended, no identity, no configured store, no directory, a clone that fails - leaves the
directory holding a placeholder, and [`session-start.mjs`](session-start.mjs) turns that into one
plain-text note before the session proceeds on default interaction behaviour. Reading is
local-first: when this repo *is* the store, the working copy wins over the default branch, so an
edit in progress is what the session sees. Otherwise the store is reached by a shallow,
blob-filtered, sparse `git clone` of that person's directories.

Being the store also constrains the tree: the directory name is the whole address, so each one is
one person's GitHub login in lower case, which [`worldRules/store-file-names.mjs`](worldRules/store-file-names.mjs)
explains and audits.

**The store is as trusted as this repository.** A person's pack is executable code - checks and
hooks that run inside every session it is copied into - so write access to a person's directory is
the power to run code in their sessions.

## Protecting each person's directory

The store's `.github/CODEOWNERS` carries a block generated from its directories
([`store_codeowners.mjs`](store_codeowners.mjs)), so each person can know that nobody but them or
the store's admin changed their pack:

```
/<path>/                 @<admin>              a new directory needs the admin's approval
/<path>/<login>/         @<login> @<admin>     one line per person
/.github/CODEOWNERS      @<admin>
```

The admin is the store repository's owning account; an organization-owned store is not
supported. The admin is listed beside each person because GitHub never counts a pull request's
author as a code owner's approval, so a person's edit of their own pack needs the admin to
approve it. Regenerate the block in the change that adds or renames a directory:

```
node .claudinite/shared/packs/claude-code-web-users-support/write_store_codeowners.mjs
```

The file only names owners. Enforcement is a setting only a person can turn on: a ruleset on the
store's default branch, targeting it, that requires a pull request and review from Code Owners,
with the admin role on its bypass list.

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

All four are advisory: a personal pack is a nice-to-have, and nothing here may block a session.
A directory missing its CODEOWNERS line falls to the admin's `/<path>/` line, so that drift fails
safe.

| Check | Severity | Reason | Enforcement |
|---|---|---|---|
| `preferences-store-configured` | medium | complexity | check: advisory |
| `preferences-store-file-names` | high | correctness | check: advisory |
| `preferences-store-codeowners` | high | correctness | check: advisory |
| `preferences-provenance` | low | complexity | check: advisory |
