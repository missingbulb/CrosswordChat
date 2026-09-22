// The git/GitHub domain pack: the procedures and owner commands for the
// git/GitHub side of the task lifecycle, bundled as skills
// (skills/git-github-advanced, skills/merge-to-main), plus the workflow-YAML and
// Actions-runner rules — the `gha/` declared checks and the
// skills/github-actions-scheduling skill. Universal reach comes from basics
// naming it in `requires`, so the closure materializes it into every
// declaration - never seeded directly, and the pack carries no fingerprint.
export default {
  version: '60922.5',
  minEngineVersion: '60822.1',
  ruleRoutingGuidance: {
    belongs: 'git and GitHub procedure and platform: commit layering, branch and merge mechanics, workflow YAML, triggers, secrets, scheduling',
    excludes: 'the issue-branch-PR lifecycle rules themselves — basics; release pipeline content for one product — its release pack',
  },
  // The `gha/` rules are declared checks, discovered structurally beside this
  // manifest (declared-checks.json). The lifecycle checks stay in basics.
};
