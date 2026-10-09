# claude-code-web-users-support — working from Claude Code on the web

- **A person asking to change one of their personal rules** - edit the pack that travels with
  them, `<path>/<login>/` in the store repo this pack names, never here and never in the canon,
  and append the entry on the rule's provenance file inside that pack, the person the actor; a
  project convention in disguise belongs in the pack owning its subject, and a rule triggering a
  command owns only the trigger phrase. (person-asking-change)

- **A person asking to record their personal rules with nothing there yet** - create
  `<path>/<login>/RULES.md` in that store repo, named for their GitHub login in lower case, since
  any other name is silently never copied, and regenerate the store's CODEOWNERS in the same
  change: (person-asking-record)

  ```
  node .claudinite/shared/packs/claude-code-web-users-support/write_store_codeowners.mjs
  ```

- **A person wanting a skill or a check of their own, not just rules** - put it in that same
  directory, which is an ordinary pack: `skills/<name>/SKILL.md`, `declared-checks.json`,
  and a `pack.json` setting neither `id` nor `version` where one is needed at all. It is copied
  into every session they open on a project declaring this pack, so it may hold nothing a
  project owns. (person-wanting-skill)

- **A web session halt-gated on a missing toolchain requirement** — re-paste
  [`environment-setup-command.sh`](environment-setup-command.sh) whole and unedited into the
  environment's Setup script field, then rebuild; a project-specific step belongs in its own
  pack's `env` declaration, never in that body. (web-session-halt)
