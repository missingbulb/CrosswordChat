// claude-code-web-users-support — what a project can offer the people who work on it
// from Claude Code on the web, and cannot offer anyone else: a web session runs for a
// signed-in person, in a managed container, and a terminal session does neither.
//
// It carries an ADDRESS, not content. Its entry config names the STORE - a repository, and
// a path inside it holding one `<login>/` directory per person, named by GitHub login:
//
//   { "id": "claude-code-web-users-support", "config": { "repo": "owner/name" } }
//
// Each such directory is an ordinary pack, copied into the session's own pack root by
// `session-prepare.mjs` and loaded by the same engine that loads this one. Beside it,
// `environment-setup-command.sh` is the generic body a project pastes into its web
// environment's Setup script field. What a repo does with the pack is its README.
export default {
  version: '60925.2',
  minEngineVersion: '60925.1',
  ruleRoutingGuidance: {
    belongs: 'what a project offers people working from Claude Code on the web, where the session knows who they are',
    excludes: 'project conventions and process — those are the packs that own each subject',
  },
  seededByDefault: true,
  questions: [
    {
      id: 'store',
      prompt: 'Where do this project\'s people keep the pack that travels with them - the repository holding one `<login>/` directory per person, named by GitHub login? Give an `owner/name` (a fleet usually has one repo for this), or say "n/a - none" if this project has no such store.',
      distill: 'the answer\'s `owner/name` becomes this entry\'s `config.repo` (add `config.path` only when the directories do not sit in `preferences/`); "n/a" leaves the entry without a config and the personal-pack feature inert',
    },
  ],
  // The Setup script field belongs to a managed container's configuration, not to the
  // checkout, so no run of anything in this repo can fill it — and until someone does,
  // a web session has no toolchain and the env check halt-gates it. Declared here so
  // the install flow prints it and the adopting session files it as an issue, rather
  // than mentioning it once in a PR body nobody returns to (#1167).
  adoptionHandover: [
    {
      step: 'Paste the body of this pack\'s environment-setup-command.sh, whole and unedited, into the web '
        + 'environment\'s Setup script field, then rebuild. Quote that body inline here in a fenced block: the '
        + 'reader of this step is the person about to paste it, and sending them to find a file in the mount is '
        + 'the hop this exists to remove.',
      breaks: 'a Claude Code web session on this repo has none of the toolchains the active packs need, and the session-start env check halt-gates it before any work',
      done: 'a web session on this repo starts with no missing-requirement halt-gate',
    },
  ],
  // Both audit the repo as it stands, whatever this session touched: a store broken by
  // an earlier commit is just as silent as one broken by this one. The second is inert
  // in every repo but the one that HOLDS the store it declares.
};
