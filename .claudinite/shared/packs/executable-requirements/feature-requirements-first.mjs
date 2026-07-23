import { finding } from '../../engine/checks/helpers/findings.mjs';

// The canonical home of the executable spec; a project whose spec lives
// elsewhere declares the path on its pack entry (`config.spec`).
const DEFAULT_SPEC = 'dev/requirements/requirements.md';

// Product work rather than specification: neither markdown nor part of the
// requirements tree (goldens and harness code there are the spec's own machinery).
const isCode = (f) => !f.endsWith('.md') && !f.startsWith('dev/requirements/');

function specPath(work) {
  const configured = work.packConfig('executable-requirements')?.spec;
  return typeof configured === 'string' && configured ? configured : DEFAULT_SPEC;
}

// After the owner's latest feature-classified comment, an independent commit
// updating the spec (no code alongside) must precede the first code commit.
// Scoped by the comment's timestamp so earlier work on the branch is never
// re-litigated.
const rule = {
  id: 'feature-requirements-first',
  severity: 'blocking',
  description: 'A feature run must land an independent requirements-doc commit before its first code commit',
  doc: 'packs/executable-requirements/RULES.md',
  scope: 'work',
  why: 'the feature run is doc-first: the spec change is the requirement\'s durable home and must precede the code that satisfies it',

  run(work) {
    const lastFeatureTurn = work.conversation().ownerTurns().filter((t) => t.classes().has('feature')).last();
    if (!lastFeatureTurn.exists) return [];

    // No spec in the repo ⇒ no commit could ever satisfy the ordering, and firing
    // would force the wrong remedy (an accept, a post-hoc rebase). Self-skip.
    const spec = specPath(work);
    if (!work.exists(spec)) return [];

    let specSeen = false;
    for (const commit of work.branchCommits().filter((c) => c.time >= lastFeatureTurn.time())) {
      const codeFiles = commit.files.filter(isCode);
      if (!codeFiles.length) {
        if (commit.files.includes(spec)) specSeen = true;
        continue;
      }
      if (specSeen) return [];
      return [finding(rule, {
        file: '(branch)',
        what: `commit ${commit.sha.slice(0, 7)} ("${commit.subject}") changes code (${codeFiles[0]}) before any independent commit updating ${spec}`,
        fix: `record the requirement first: land a commit updating ${spec} with no code alongside, then the tests and implementation — rebase to reorder if the code is already committed`,
      })];
    }
    return [];
  },
};

export default rule;
