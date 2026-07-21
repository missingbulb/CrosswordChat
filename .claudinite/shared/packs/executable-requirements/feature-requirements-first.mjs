import { finding } from '../../engine/checks/helpers/findings.mjs';
import { classifiedTurns } from '../../engine/checks/helpers/session-transcript.mjs';

// The canonical home of the executable spec. A project whose spec lives elsewhere
// declares the path on its executable-requirements pack entry (`config.spec`), so
// the check enforces ordering against the REAL spec instead of a path the project
// doesn't use.
const DEFAULT_SPEC = 'dev/requirements/requirements.md';

// A file whose change is product work rather than specification: anything that
// is neither markdown nor part of the requirements tree. Goldens and harness
// code under dev/requirements/ count as the spec's own machinery, not "code
// before the spec".
const isCode = (f) => !f.endsWith('.md') && !f.startsWith('dev/requirements/');

// The spec path this project actually uses: its configured value, else canonical.
function specPath(ctx) {
  const configured = ctx.config?.packConfig?.['executable-requirements']?.spec;
  return typeof configured === 'string' && configured ? configured : DEFAULT_SPEC;
}

// Conversation-surface rule enforcing the feature run's doc-first ordering on
// the branch: after the owner's latest feature-classified comment, an
// independent commit updating the spec (no code alongside) must precede the
// first code commit. Scoped by the comment's timestamp so earlier work already
// on the branch — a previous task, a previous run — is never re-litigated.
const rule = {
  id: 'feature-requirements-first',
  severity: 'blocking',
  description: 'A feature run must land an independent requirements-doc commit before its first code commit',
  doc: 'packs/executable-requirements/RULES.md',
  why: 'the feature run is doc-first: the spec change is the requirement\'s durable home and must precede the code that satisfies it',

  run(ctx) {
    const entries = ctx.conversation();
    if (!entries) return [];
    const featureTurns = classifiedTurns(entries).filter((t) => t.classes.has('feature'));
    if (!featureTurns.length) return [];

    // A check-the-work rule must be satisfiable by doing the work right. If the spec
    // it would enforce ordering against isn't in the repo at all (a non-canonical
    // layout that hasn't declared its path, or the pack pulled in via `requires`
    // without the canonical file), no commit could ever satisfy it — firing would
    // force the wrong remedy: an `accept` (a check-the-WORLD instrument, which a
    // successive run wouldn't even re-find) or a post-hoc rebase. Self-skip instead
    // of emitting a finding no correct work can clear.
    const spec = specPath(ctx);
    if (!ctx.exists(spec)) return [];

    const since = Date.parse(featureTurns[featureTurns.length - 1].timestamp ?? '') || 0;

    let specSeen = false;
    for (const commit of ctx.commitsWithFiles()) {
      if ((Date.parse(commit.date) || 0) < since) continue;
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
