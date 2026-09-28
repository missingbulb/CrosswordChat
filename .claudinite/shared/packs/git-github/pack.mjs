// The git/GitHub domain pack: the procedures and owner commands for the
// git/GitHub side of the task lifecycle, bundled as skills
// (skills/git-github-advanced, skills/merge-to-main), plus the workflow-YAML and
// Actions-runner rules — the `gha/` declared checks and the
// skills/github-actions-scheduling skill. Universal reach comes from basics
// naming it in `requires`, so the closure materializes it into every
// declaration - never seeded directly, and the pack carries no fingerprint.
export default {
  version: '60927.3',
  minEngineVersion: '60925.1',
  ruleRoutingGuidance: {
    belongs: 'git and GitHub procedure and platform: commit layering, branch and merge mechanics, workflow YAML, triggers, secrets, scheduling',
    excludes: 'the issue-branch-PR lifecycle rules themselves — basics; release pipeline content for one product — its release pack',
  },
  pitch: 'GitHub Actions and the GitHub API have behaviours that look fine until a run silently skips a step or a scheduled job quietly stops. This pack carries dozens of checks over workflow files and tool calls: secrets misused in job conditions, missing pipefail, cron jobs on the busy hour, scheduled failures nobody hears about, unqualified pull request heads. Its skills cover advanced git procedure such as recovering a branch after a squash merge, what a cron schedule actually guarantees, and a clean merge-to-main sequence.',
  // The `gha/` rules are declared checks, discovered structurally beside this
  // manifest (declared-checks.json). The lifecycle checks stay in basics.
};
