// The DIGEST: what a sampled session was doing, reduced to something a reader can
// judge a finding against without opening a transcript.
//
// Two rules ask whether a skill SHOULD have loaded in a session where it did not,
// and that judgment is deliberately not made here. The review stops at the digest -
// the owner's prompts, the tools called with their targets, the files edited, the
// commands run - and leaves the question to whoever reads the finding, human or
// agent, with the digest and the skill's description side by side. An agent phase
// would spend a session a day on a question a reader answers in a minute, and only
// once the finding has lasted.
//
// Deterministic by construction: no sampling randomness, no model, no wall clock.
// The same window produces the same digest, which is what lets the review's own
// unchanged-compare open no pull request on a day nothing moved.
import { execFileSync } from 'node:child_process';

export const SAMPLES = 5;
export const LOGS_BRANCH = 'conversation-logs';

const firstLine = (text) => String(text ?? '').trim().split('\n')[0].slice(0, 200);

// The target a call names, in one short phrase - what a reader needs to tell what
// the session was doing, never the call's whole input.
export function callTarget(call) {
  const input = call?.input ?? {};
  if (typeof input.file_path === 'string') return input.file_path;
  if (typeof input.command === 'string') return firstLine(input.command);
  if (typeof input.skill === 'string') return input.skill;
  if (typeof input.pattern === 'string') return input.pattern;
  if (typeof input.url === 'string') return input.url;
  return '';
}

// One session's digest, from its parsed entries.
export function digestOf(entries) {
  const prompts = [];
  const tools = new Map();
  const files = new Set();
  const commands = [];
  for (const entry of entries ?? []) {
    if (entry?.type === 'user' && entry?.origin?.kind === 'human' && typeof entry?.message?.content === 'string') {
      prompts.push(firstLine(entry.message.content));
      continue;
    }
    if (entry?.type !== 'assistant' || !Array.isArray(entry?.message?.content)) continue;
    for (const block of entry.message.content) {
      if (block?.type !== 'tool_use' || typeof block?.name !== 'string') continue;
      tools.set(block.name, (tools.get(block.name) ?? 0) + 1);
      const target = callTarget(block);
      if (['Edit', 'Write', 'NotebookEdit', 'Read'].includes(block.name) && target) files.add(target);
      if (block.name === 'Bash' && target) commands.push(target);
    }
  }
  return {
    prompts: prompts.slice(0, SAMPLES * 2),
    tools: Object.fromEntries([...tools.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)),
    files: [...files].sort().slice(0, 20),
    commands: commands.slice(0, 20),
  };
}

// The capture files on the logs branch, newest first, with the date and session each
// name carries. A repo whose retention is zero - capture-only - has none, and every
// digest below is then *not sampled*, which the review states rather than hides.
export function captureFiles(root, branch = LOGS_BRANCH) {
  try {
    const names = execFileSync('git', ['ls-tree', '-r', '--name-only', `origin/${branch}`],
      { cwd: root, encoding: 'utf8', maxBuffer: 1 << 28 }).trim().split('\n').filter(Boolean);
    return names
      .map((name) => ({ name, date: /^(\d{4}-\d{2}-\d{2})/.exec(name)?.[1] ?? null }))
      .filter((f) => f.date)
      .sort((a, b) => b.name.localeCompare(a.name));
  } catch { return []; }
}

export function readCapture(root, name, branch = LOGS_BRANCH) {
  try {
    return execFileSync('git', ['show', `origin/${branch}:${name}`],
      { cwd: root, encoding: 'utf8', maxBuffer: 1 << 28 })
      .split('\n').filter(Boolean)
      .map((line) => { try { return JSON.parse(line); } catch { return null; } })
      .filter(Boolean);
  } catch { return null; }
}

// Up to five digests from inside the window, newest first. `select` narrows the
// files to the ones a finding wants - the sessions where a skill did NOT load, for
// the two rules that ask about those.
export function sampleDigests(root, files, { from, to, select = () => true, limit = SAMPLES } = {}) {
  const out = [];
  for (const file of files) {
    if (out.length >= limit) break;
    if (from && file.date < from) break;   // sorted newest first, so nothing older follows
    if (to && file.date > to) continue;
    const entries = readCapture(root, file.name);
    if (!entries || !select(entries, file)) continue;
    out.push({ capture: file.name, date: file.date, ...digestOf(entries) });
  }
  return out;
}
