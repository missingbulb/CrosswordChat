// The one place a person is ASKED for attention, and the gate on asking.
//
// An issue is filed only for a finding that has lasted two weeks and whose cause is
// well enough known that the recommendation is worth reading. A finding with an
// `unknown` cause never files: it stays in the review file and on the dashboard,
// which is where evidence belongs until it is more than evidence. Most findings on a
// young window are floor noise or one week's weather, and an issue per finding on
// first sight teaches a reader to skim the label.
//
// These issues carry no `task:` marks. They are a person's inbox, not a run's, and
// the queue must never pick one up.
import { daysBetween, LASTING_DAYS } from './report.mjs';

export const LABEL = 'usage-finding';
export const ACTIONABLE = new Set(['known', 'probable']);

export const issueTitle = (finding) => `Usage: ${finding.rule} - ${finding.subject}`;

export const filingsFor = (file) => file.findings.filter((f) => f.lasting && ACTIONABLE.has(f.cause));

// The open issues this review no longer has a finding for - closed with the figures
// that cleared them, which is what makes a close readable as a result rather than as
// housekeeping.
export function closuresFor(file, openTitles) {
  const live = new Set(file.findings.map(issueTitle));
  return openTitles
    .filter((t) => t.startsWith('Usage: ') && !live.has(t))
    .map((title) => ({ title, ...parseTitle(title) }));
}

export function parseTitle(title) {
  const m = /^Usage: ([a-z0-9-]+) - (.+)$/.exec(title);
  return m ? { rule: m[1], subject: m[2] } : { rule: null, subject: null };
}

const list = (items) => items.map((c) => `- ${c}`).join('\n');

export function issueBody(finding, file) {
  const age = daysBetween(finding.since, file.generated.slice(0, 10));
  return [
    `**${finding.finding}**`,
    '',
    `\`${finding.subject}\`${finding.pack ? ` (the ${finding.pack} pack)` : ''} - rule \`${finding.rule}\`, `
    + `cause **${finding.cause}**, standing since **${finding.since}** (${age} days).`,
    '',
    '## Figures',
    '',
    ...Object.entries(finding.figures).map(([k, v]) => `- \`${k}\`: ${v ?? '*not recorded*'}`),
    '',
    `Window ${file.window.from} to ${file.window.to}, ${file.window.daysCovered} days of record.`,
    '',
    `## Causes, ${finding.open ? 'in the order to work through' : 'closed by the mechanism'}`,
    '',
    list(finding.causes),
    ...(finding.open ? ['', 'This list is only what its authors thought of - a cause outside it is a real answer.'] : []),
    '',
    '## Recommendation',
    '',
    finding.recommendation,
    ...(finding.digests?.length ? ['', '## What those sessions were doing', '',
      ...finding.digests.map((d) => `- **${d.date}** - ${d.prompts[0] ?? '(no prompt)'} · `
        + `${Object.entries(d.tools).map(([t, n]) => `${t}×${n}`).join(', ')}`)] : []),
    ...(finding.digests === null ? ['', 'No digests: this repo keeps no captures to sample.'] : []),
    ...(finding.acceptances?.length ? ['', '## Acceptances', '',
      list(finding.acceptances.map((a) => `\`${a.file ?? '(no file)'}\` - ${a.reason ?? 'no reason given'}`))] : []),
    '',
    '---',
    '',
    `Filed by the usage review, which changes nothing. Last confirmed on ${file.generated.slice(0, 10)}; `
    + 'the review closes this issue the day the finding clears. A proposal for what to do about it comes '
    + 'from `usage-triage`, as a pull request the owner merges or declines.',
  ].join('\n');
}

export function closingComment(stale, file) {
  return [
    `Cleared - the ${file.window.from} to ${file.window.to} review no longer finds `
    + `\`${stale.rule}\` over \`${stale.subject}\`.`,
    '',
    'Closed by the usage review.',
  ].join('\n');
}

export { LASTING_DAYS };
