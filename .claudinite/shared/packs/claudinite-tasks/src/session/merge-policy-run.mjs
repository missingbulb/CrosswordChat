// THE AUTOMERGE VERDICT, AS A COMMAND — the landing lane runs this before it may
// merge, and quotes the `AUTOMERGE:` line it prints (deliver-pr.md):
//
//   node <this file> --base origin/main --policy 'comment-only-changes;readme-changes'
//
// It sits here rather than beside the policy engine because reading the diff is a
// world edge — git, the environment, the checkout — and what a task's `automerge`
// MEANS may not depend on who is asking. `src/contract/merge-policy.mjs` decides;
// this reads the world and prints.

import { policyVerdict, declaredMergeRules } from '../contract/merge-policy.mjs';
import { runGit } from '../world/processes.mjs';
import { actionsEnv, repoRoot } from '../world/actions.mjs';

const git = (args, cwd) => runGit(args, {
  cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'],
});

// The content of `file` at `ref`, or null when it does not exist there (an added
// file) — the same answer a deleted file's "after" gets.
function contentAt(ref, file, cwd) {
  try {
    return git(['show', `${ref}:${file}`], cwd);
  } catch {
    return null;
  }
}

// The diff this branch carries against `base`, read from the merge base so
// commits that landed on the base meanwhile are not counted as this run's work.
export function diffEntries({ base, cwd = repoRoot() }) {
  // The checkouts these runs work in are shallow, where `merge-base` has no common
  // ancestor to find; the base ref itself is then the honest comparison point.
  let mergeBase;
  try {
    mergeBase = git(['merge-base', base, 'HEAD'], cwd).trim();
  } catch {
    mergeBase = base;
  }
  const names = git(['diff', '--name-only', mergeBase, 'HEAD'], cwd).split('\n').map((l) => l.trim()).filter(Boolean);
  return names.map((file) => ({
    file,
    before: contentAt(mergeBase, file, cwd),
    after: contentAt('HEAD', file, cwd),
  }));
}

// --- the CLI ------------------------------------------------------------------
// What the landing lane runs before it may merge:
//   node <this file> --base origin/main --policy 'comment-only-changes;readme-changes'
// Prints one line per changed file and a final `AUTOMERGE: yes|no — why` verdict
// line the worker quotes. Pack-declared rules resolve from the repo's ACTIVE
// packs (loaded here, not at import time — discovery re-importing this module
// mid-evaluation must find no work started).
async function main() {
  const argv = process.argv.slice(2);
  const at = (flag) => (argv.includes(flag) ? argv[argv.indexOf(flag) + 1] : null);
  const cwd = at('--root') ?? actionsEnv().CLAUDE_PROJECT_DIR ?? repoRoot();
  const base = at('--base') ?? 'origin/main';
  const policy = at('--policy');
  if (policy === null) {
    console.error('merge-policy: --policy is required (the task\'s automerge, or the item\'s Merge: value)');
    process.exitCode = 2;
    return;
  }

  const { loadPacks } = await import('../../../../engine/pack_loader/pack-registry.mjs');
  const { loadConfig } = await import('../../../../engine/checks/helpers/repo-context.mjs');
  const packs = await loadPacks({ localRoot: cwd });
  const { rules, errors } = declaredMergeRules(packs, loadConfig(cwd));
  for (const e of errors) console.error(`merge-policy: ${e}`);

  const entries = diffEntries({ base, cwd });
  const verdict = policyVerdict({ policy, entries, declaredRules: rules, ruleErrors: errors });
  for (const { file, verdict: v } of verdict.files) console.log(`  ${v.padEnd(32)} ${file}`);
  console.log(`\nAUTOMERGE: ${verdict.mergeable ? 'yes' : 'no'} — ${verdict.why}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error(`merge-policy: ${e.message}`); process.exitCode = 1; });
}
