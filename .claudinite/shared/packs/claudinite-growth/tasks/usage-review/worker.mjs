// The usage review's I/O shell: read the record, read the tree, evaluate the rules,
// write the file, move the dashboard and the issues. Every decision is in a
// declaration or in a tested pure function - this file only moves data between them.
//
// It changes NOTHING it reviews. Not a pack element, not a provenance log, not a
// check's on_fail. The file it writes and the issues it files are an analysis with a
// recommendation attached; the one stage that edits anything is `usage-triage`, and
// the owner merges that or declines it.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { baseTip, remoteUrl, readAt } from '../../../claudinite-tasks/public/delivery.mjs';
import { evaluateRules } from './evaluate.mjs';
import { figureReader } from './figures.mjs';
import { readWindows } from './read-record.mjs';
import { readSkills, readRules, acceptanceReader, acceptanceReasons, packDeclaredAt, adoptionWindow } from './read-live.mjs';
import { captureFiles, sampleDigests } from './digests.mjs';
import { reviewFile, dashboardValues, prBody, findingKey, REVIEW_PATH, DASHBOARD_PATH, LEGACY_PATHS } from './report.mjs';

const here = dirname(fileURLToPath(import.meta.url));
// The run's own coordinates. Module-level because the helpers below close over them,
// and set once from the bag when the run starts.
let root = null;
let repo = null;
let base = 'main';
let token = null;
const log = (m) => console.log(`usage-review: ${m}`);

const engine = (mod) => join(root, '.claudinite', 'shared', 'engine', mod);
const engineOrLocal = async (mod) => {
  try { return await import(engine(mod)); } catch { return import(join(root, 'engine', mod)); }
};

// The findings whose rules want a sample of what the sessions were doing: the one
// that asks whether a skill should have loaded in a window where it did not.
const WANTS_DIGESTS = new Set(['skill-adoption-not-reached']);

export async function worker({ root: runRoot, repo: runRepo, defaultBranch, token: runToken, deliver }) {
  root = runRoot;
  repo = runRepo;
  token = runToken;
  base = defaultBranch ?? 'main';
  const config = JSON.parse(readFileSync(join(root, '.claudinite-settings.json'), 'utf8'));
  const { loadPacks, isActive } = await engineOrLocal('pack_loader/pack-registry.mjs');
  const { packRules } = await engineOrLocal('checks/run-active-pack-rules.mjs');
  const packs = (await loadPacks({ localRoot: root })).filter((p) => isActive(p, config));

  const today = new Date().toISOString().slice(0, 10);
  const record = readWindows(root, today);
  if (!record) { log('no usage fold to review yet - nothing to do'); return; }

  const skills = await readSkills(root, packs);
  const { check, guard } = readRules(packs, packRules(packs));
  const acceptancesOf = acceptanceReader(config);
  const live = { acceptancesOf };

  // A skill expecting `adoption` is judged only once its pack's adoption window has
  // closed: inside it, a skill that has not loaded may simply not have been reached.
  const declaredAt = new Map(packs.map((p) => [p.id, packDeclaredAt(root, p.id)]));
  const adoptionClosed = (skill) => adoptionWindow(declaredAt.get(skill.pack), new Date().toISOString())?.closed === true;

  const subjectsOf = (rule) => {
    if (rule.over === 'checks') return [{ id: 'checks', pack: null }];
    if (rule.over === 'check') return check;
    if (rule.over === 'guard') return guard;
    let set = skills;
    if (rule.expect) set = set.filter((s) => s.expect === rule.expect);
    if (rule.window === 'adoption') set = set.filter(adoptionClosed);
    return set;
  };

  const readFigure = figureReader({ window: record.window, previous: record.previous, live });
  const rules = JSON.parse(readFileSync(join(here, '..', '..', 'usage-rules.json'), 'utf8')).rules;
  const { findings, notEvaluated } = evaluateRules(rules, {
    subjectsOf,
    figureOf: readFigure,
    predicateOf: (subject, name) => (name === 'proseTwin' ? subject.proseTwin ?? null : null),
  });

  // `since` - the first review this finding appeared in - comes from the PRIOR file
  // at the base tip, never from local HEAD: the checkout may be sitting on this
  // task's own open pull request, and the base is the only authority on what has
  // already been reviewed.
  const remote = remoteUrl(repo, token);
  const baseSha = token && repo ? baseTip(root, remote, base) : null;
  const atBase = (path) => (baseSha ? readAt(root, baseSha, path) : null);
  const priorText = atBase(REVIEW_PATH) ?? atBase(LEGACY_PATHS[REVIEW_PATH]);
  // Each file still at its old path moves to its new one in its own commit, bytes
  // unchanged, before this review writes on top of it.
  const moves = Object.fromEntries(Object.entries(LEGACY_PATHS)
    .filter(([path, legacy]) => atBase(path) === null && atBase(legacy) !== null)
    .map(([path, legacy]) => [legacy, path]));
  const prior = priorText ? JSON.parse(priorText) : null;
  const priorSince = new Map((prior?.findings ?? []).map((f) => [findingKey(f), f.since]));
  for (const finding of findings) finding.since = priorSince.get(findingKey(finding)) ?? today;

  // The evidence, attached: a reader never goes back to a transcript to judge one.
  const captures = captureFiles(root);
  if (!captures.length) log('no capture branch - digests recorded as not sampled');
  for (const finding of findings) {
    if (!WANTS_DIGESTS.has(finding.rule)) continue;
    finding.digests = captures.length
      ? sampleDigests(root, captures, { from: record.window.from, to: record.window.to })
      : null;
  }
  for (const finding of findings) {
    if (finding.rule !== 'check-accepted-away') continue;
    finding.acceptances = acceptanceReasons(config, finding.subject);
  }

  const unstated = skills.filter((s) => s.expect === null).map((s) => ({ skill: s.id, pack: s.pack }));
  const file = reviewFile({ record, findings, notEvaluated, unstated, skills, check, guard, today });

  writeFileSync(join(root, REVIEW_PATH), `${JSON.stringify(file, null, 2)}\n`);
  mkdirSync(join(root, dirname(DASHBOARD_PATH)), { recursive: true });
  const dashboard = `${JSON.stringify(dashboardValues(file, prior), null, 2)}\n`;
  writeFileSync(join(root, DASHBOARD_PATH), dashboard);
  log(`${findings.length} findings, ${notEvaluated.length} not evaluated, ${unstated.length} skills unstated`);

  if (!token || !repo) { log('no token - the file is written, nothing delivered'); return; }

  await deliver({
    branchPrefix: 'claudinite/usage-review',
    files: { [REVIEW_PATH]: `${JSON.stringify(file, null, 2)}\n`, [DASHBOARD_PATH]: dashboard },
    moves,
    title: `Usage review: ${findings.length} findings in the 28 days to ${record.window.to}`,
    body: prBody(file),
    message: `Usage review for the 28 days to ${record.window.to}`,
  });

  await syncIssues(file);
}

// One issue per (rule, subject) whose finding has lasted two weeks with a cause
// worth reading, updated in place while it persists and closed the day it clears.
// A finding with an `unknown` cause never files: it stays in the file and on the
// dashboard, which is where evidence belongs until it is more than evidence.
async function syncIssues(file) {
  const { filingsFor, closuresFor, issueTitle, issueBody, closingComment } = await import('./issues.mjs');
  const api = async (path, init) => {
    const res = await fetch(`https://api.github.com${path}`, {
      ...init,
      headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json', 'content-type': 'application/json' },
      body: init?.body ? JSON.stringify(init.body) : undefined,
    });
    return { status: res.status, json: await res.json().catch(() => null) };
  };
  const { json: open } = await api(`/repos/${repo}/issues?state=open&labels=usage-finding&per_page=100`);
  const byTitle = new Map((Array.isArray(open) ? open : []).map((i) => [i.title, i]));

  for (const finding of filingsFor(file)) {
    const title = issueTitle(finding);
    const existing = byTitle.get(title);
    const body = issueBody(finding, file);
    if (existing) {
      await api(`/repos/${repo}/issues/${existing.number}`, { method: 'PATCH', body: { body } });
      log(`updated #${existing.number} - ${title}`);
    } else {
      const { json } = await api(`/repos/${repo}/issues`, { method: 'POST', body: { title, body, labels: ['usage-finding'] } });
      log(`filed #${json?.number ?? '?'} - ${title}`);
    }
  }
  for (const stale of closuresFor(file, [...byTitle.keys()])) {
    const issue = byTitle.get(stale.title);
    if (!issue) continue;
    await api(`/repos/${repo}/issues/${issue.number}/comments`, { method: 'POST', body: { body: closingComment(stale, file) } });
    await api(`/repos/${repo}/issues/${issue.number}`, { method: 'PATCH', body: { state: 'closed', state_reason: 'completed' } });
    log(`closed #${issue.number} - the finding cleared`);
  }
}
