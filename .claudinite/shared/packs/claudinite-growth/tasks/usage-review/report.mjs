// What the review WRITES: the file's shape, the dashboard's values, and the pull
// request's body. Pure over the evaluation's result, so the whole of what a reader
// sees is testable without a repository, a token or a clock.
export const LASTING_DAYS = 14;

// Where the review's two outputs land. Here rather than in the worker because the
// precondition reads the first one to decide whether there is anything new to
// review, and a precondition must not import the worker's delivery machinery to
// learn a path.
// Both are ROLLING: each review carries `since` and the dashboard's `previous` forward
// from the last, so neither is named GENERATED.
export const REVIEW_PATH = '.claudinite/usage/element-review-findings.json';
export const DASHBOARD_PATH = '.claudinite/usage/claudinite-growth-dashboard-values.json';
// Where the two lived before `.claudinite/usage/`: read as the prior review until the
// files have moved, and moved by the delivery rather than dropped.
// @legacy-tolerance advisory:legacy-shape-in-use retire:#2323
export const LEGACY_PATHS = Object.freeze({
  [REVIEW_PATH]: '.claudinite/local/usage-review.GENERATED.json',
  [DASHBOARD_PATH]: '.claudinite/local/dashboard/claudinite-growth.GENERATED.json',
});

// A finding's identity is the pair it is about, and nothing else - not the figures,
// which move every day, and not the sentence, which an author may reword. That is
// what lets `since` survive a rule's prose being improved.
export const findingKey = (finding) => `${finding.rule}\u0000${finding.subject}`;

const byRuleThenSubject = (a, b) => a.rule.localeCompare(b.rule) || a.subject.localeCompare(b.subject);

export const daysBetween = (from, to) =>
  Math.round((new Date(`${to}T00:00:00Z`) - new Date(`${from}T00:00:00Z`)) / 86400000);

// The whole file. `notEvaluated` is as much of the answer as `findings`: *no
// findings* is a result only when nothing was skipped for want of a floor.
export function reviewFile({ record, findings, notEvaluated, unstated, skills, check, guard, today }) {
  return {
    generated: `${today}T00:00:00Z`,
    window: {
      from: record.window.from,
      to: record.window.to,
      daysCovered: record.window.daysCovered,
      previous: { from: record.previous.from, to: record.previous.to, daysCovered: record.previous.daysCovered },
      foldedThrough: record.foldedThrough,
      subjects: { skills: skills.length, checks: check.length, guards: guard.length },
      // How many rules the twin definition could not see a twin for. A reader
      // weighing `check-never-fires-with-prose-twin` needs this: the definition is
      // deliberately narrow, and a large number here is the definition's limit
      // showing rather than a fleet of twin-less checks.
      twinless: check.filter((c) => !c.proseTwin).length,
    },
    findings: [...findings].sort(byRuleThenSubject).map((f) => ({
      ...f,
      lasting: daysBetween(f.since, today) >= LASTING_DAYS,
    })),
    notEvaluated: [...notEvaluated].sort(byRuleThenSubject),
    unstated: [...unstated].sort((a, b) => a.skill.localeCompare(b.skill)),
  };
}

const CAUSES = ['known', 'probable', 'unknown'];

// The dashboard's values, keyed by widget id. The pack contributes DATA; the
// dashboard owns every line of code that renders it.
export function dashboardValues(file, prior) {
  const now = file.findings.length;
  const before = prior?.findings?.length ?? null;
  return {
    'usage-findings': {
      value: now,
      previous: before,
      // A window against the window before, never a running total: a cumulative
      // count of findings ever seen is a number nothing measures.
      note: `${file.window.from} to ${file.window.to}`,
    },
    'usage-newest': {
      rows: [...file.findings]
        .sort((a, b) => b.since.localeCompare(a.since) || a.subject.localeCompare(b.subject))
        .slice(0, 10)
        .map((f) => ({ subject: f.subject, rule: f.rule, cause: f.cause, since: f.since })),
    },
  };
}

const table = (rows, headers) => [
  `| ${headers.join(' | ')} |`,
  `| ${headers.map(() => '---').join(' | ')} |`,
  ...rows.map((r) => `| ${r.join(' | ')} |`),
].join('\n');

// The pull request's body: the findings as a table per cause confidence, so the
// ones whose recommendation is worth acting on are read first.
export function prBody(file) {
  const out = [
    `The ${file.window.daysCovered} days of record in the 28 to **${file.window.to}**, `
    + `against ${file.window.subjects.skills} skills, ${file.window.subjects.checks} checks `
    + `and ${file.window.subjects.guards} guards.`,
    '',
    'This review changes nothing. It is an analysis with a recommendation attached; '
    + '`usage-triage` is the stage that proposes a diff, and the owner merges it or declines it.',
  ];
  for (const cause of CAUSES) {
    const rows = file.findings.filter((f) => f.cause === cause);
    if (!rows.length) continue;
    out.push('', `## Cause ${cause} - ${rows.length}`, '');
    out.push(table(rows.map((f) => [
      `\`${f.subject}\``,
      `\`${f.rule}\``,
      f.finding,
      Object.entries(f.figures).map(([k, v]) => `${k} ${v ?? '-'}`).join(', '),
      f.since + (f.lasting ? ' ⏳' : ''),
    ]), ['subject', 'rule', 'finding', 'figures', 'since']));
  }
  if (!file.findings.length) {
    out.push('', file.notEvaluated.length
      ? `No findings - but ${file.notEvaluated.length} rule/subject pairs were **not evaluated**, so this is not yet a clean window.`
      : 'No findings, and every rule was evaluated.');
  }
  if (file.notEvaluated.length) {
    const short = file.notEvaluated.slice(0, 20);
    out.push('', `## Not evaluated - ${file.notEvaluated.length}`, '');
    out.push(table(short.map((n) => [
      `\`${n.subject}\``, `\`${n.rule}\``, n.name, n.need ?? '-', n.have ?? '*not recorded*',
    ]), ['subject', 'rule', 'figure', 'needs', 'has']));
    if (file.notEvaluated.length > short.length) out.push('', `…and ${file.notEvaluated.length - short.length} more, in the file.`);
  }
  if (file.unstated.length) {
    out.push('', `## Skills stating no expectation - ${file.unstated.length}`, '',
      file.unstated.map((u) => `\`${u.skill}\``).join(', '),
      '', 'Only *always loaded* is evaluated for these. A `usage` block in the frontmatter is what the rest reads.');
  }
  return out.join('\n');
}
