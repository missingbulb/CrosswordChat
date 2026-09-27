// How one session USED the corpus: which skills loaded and what made them load,
// which guards fired, how many moments a triggered skill's declaration actually
// had, and what the checks cost. The other half of a capture file's counting -
// the fold counts what the session produced, this counts what the corpus did
// to it - and the record the usage review's rules are evaluated against.
//
// EVERY COUNTER HERE IS A FLOOR. The marks are the hooks' own `hooklog` lines,
// which reach the transcript because hooklog mirrors to stderr and the harness
// records hook stderr. A hook killed before it logged, or a line the harness
// dropped, is invisible, and what that leaves is an under-count - the same bound
// the check counters already state for themselves.
import { isUserMessage, commandName, skillToolLoads, toolCalls, entryText } from './capture-entries.mjs';

// A hooklog line - `<iso> run=<id> <hook>: <message>`. Deduped on the whole line: the
// timestamp is to the second and the run id is per hook execution, so two
// recordings of one emission collapse and two real emissions do not.
const HOOK_LINE_RE = /(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z) run=(\S+) ([A-Za-z]+): (.+)/g;

// The hook marks one entry carries, in the order the text holds them.
export function hookMarks(entry, seen = new Set()) {
  const out = [];
  for (const text of entryText(entry)) {
    for (const m of String(text).matchAll(HOOK_LINE_RE)) {
      if (seen.has(m[0])) continue;
      seen.add(m[0]);
      out.push({ stamp: m[1], run: m[2], hook: m[3], message: m[4].trim() });
    }
  }
  return out;
}

const RE_BLOCK_EDIT = /^done exit=2 skill-not-loaded (\S+) needs (\S+)/;
const RE_BLOCK_CALL = /^done exit=2 skill-not-loaded-for-call (\S+) needs (\S+)/;
const RE_GUARD_BLOCK = /^done exit=2 action-guard (\S+)/;
const RE_GUARD_ADVISORY = /^advisory action-guard (\S+)/;
const RE_TRIGGER_RESULT = /^skill-trigger \S+ (\S+)$/;
const RE_TRIGGER_PROMPT = /^skill-trigger (\S+)$/;

// What one mark says about the corpus, or null where it says nothing counted here.
// `cause` is what a load following the mark was caused BY, which is why the marks
// are read in order rather than tallied.
export function readMark({ hook, message }) {
  let m;
  if (hook === 'PreToolUse') {
    if ((m = RE_BLOCK_EDIT.exec(message))) return { kind: 'block', cause: 'blockedEdit', skills: m[2].split(',') };
    if ((m = RE_BLOCK_CALL.exec(message))) return { kind: 'block', cause: 'blockedCall', skills: m[2].split(',') };
    if ((m = RE_GUARD_BLOCK.exec(message))) return { kind: 'guard', severity: 'blocking', rules: m[1].split(',') };
    if ((m = RE_GUARD_ADVISORY.exec(message))) return { kind: 'guard', severity: 'advisory', rules: m[1].split(',') };
    return null;
  }
  // A PostToolUse trigger names its tool before its skills; a UserPromptSubmit one
  // carries the skills alone. The same event either way - a declared trigger fired
  // and the session was told to load - counted apart only by what caused it.
  if (hook === 'PostToolUse' && (m = RE_TRIGGER_RESULT.exec(message))) {
    return { kind: 'trigger', cause: 'resultTrigger', skills: m[1].split(',') };
  }
  if (hook === 'UserPromptSubmit' && (m = RE_TRIGGER_PROMPT.exec(message))) {
    return { kind: 'trigger', cause: 'promptTrigger', skills: m[1].split(',') };
  }
  return null;
}

// The check runners' timing record, as the Stop hook logs it:
//
//   claudinite-check-timing v1 <scope> total=<ms> <rule>=<ms> …
//
// Spelled here rather than imported from the engine module that renders it: the
// engine and this pack land on separate cycles, so every member spends a window
// holding an older engine beside this pack, and a static import of a module that
// engine does not carry fails the whole mount's self-test. The drift guard is a
// test that drives the ENGINE's real renderer and fails if this reader stops
// reading what it writes.
const RE_TIMING = /claudinite-check-timing v1 (\S+) total=(\d+)((?: [^\s=]+=\d+)*)\s*$/;
export function parseTiming(text) {
  const m = RE_TIMING.exec(String(text ?? ''));
  if (!m) return null;
  const rules = m[3].trim() ? m[3].trim().split(/\s+/).map((pair) => {
    const at = pair.lastIndexOf('=');
    return { id: pair.slice(0, at), ms: Number(pair.slice(at + 1)) };
  }) : [];
  return { scope: m[1], totalMs: Number(m[2]), rules };
}

// What the checks cost this session: the timing record each Stop sweep prints,
// keyed `<scope>` for the whole sweep and `<scope>/<rule>` for one rule in it.
// The record names only its slowest rules, so the per-rule keys do not sum to the
// scope's total - which is why the total is carried as a key of its own rather
// than derived.
export function countCheckTiming(entries) {
  const out = {};
  const seen = new Set();
  const add = (key, ms) => {
    const row = (out[key] ??= { runs: 0, totalMs: 0, maxMs: 0 });
    row.runs += 1;
    row.totalMs += ms;
    row.maxMs = Math.max(row.maxMs, ms);
  };
  for (const entry of entries ?? []) {
    for (const { message } of hookMarks(entry, seen)) {
      const record = parseTiming(message);
      if (!record) continue;
      add(record.scope, record.totalMs);
      for (const rule of record.rules) add(`${record.scope}/${rule.id}`, rule.ms);
    }
  }
  return out;
}

// Why a skill's body entered a session. `voluntary` is the one that says the
// session reached for it on its own, which is what the always-loaded and
// forced-only rules are read from; the rest each name the thing that made it.
export const LOAD_CAUSES = Object.freeze([
  'voluntary', 'blockedEdit', 'blockedCall', 'resultTrigger', 'promptTrigger', 'command', 'read',
]);

const emptyCauses = () => Object.fromEntries(LOAD_CAUSES.map((c) => [c, 0]));

// A `Read` of a mounted skill's own SKILL.md - the third way a body enters a
// session, and the one every guard's block text offers as the alternative to the
// Skill tool, so it is a load like the others.
const RE_SKILL_MD = /(?:^|\/)skills\/([a-z0-9][a-z0-9-]*)\/SKILL\.md$/;
const readLoads = (entry, mounted) => toolCalls(entry)
  .filter((c) => c.name === 'Read' && typeof c.input.file_path === 'string')
  .map((c) => RE_SKILL_MD.exec(c.input.file_path)?.[1])
  .filter((name) => name && mounted.has(name));

// Every tool_use block's name, sidechains included - a subagent's call is a call.
// The denominator the result-trigger rules read: how often the tool was used at
// all, against how often its trigger fired.
export function countToolCalls(entries) {
  const out = {};
  for (const entry of entries ?? []) for (const call of toolCalls(entry)) out[call.name] = (out[call.name] ?? 0) + 1;
  return out;
}

// The session's skill and guard record, read as ONE ordered pass so a load can be
// attributed to the mark that caused it.
//
// A load's cause is the nearest earlier mark naming that skill since that skill's
// last load. Where the body arrived through a typed `/command` or a `Read` of the
// SKILL.md, that is the cause instead, since those say how it arrived without any
// mark. Nothing earlier naming it is `voluntary`.
export function countCorpusUse(entries, mounted = new Set()) {
  const skillLoadsBy = {};
  const skillBlocks = {};
  const triggerFires = {};
  const guardFires = {};
  const seen = new Set();
  // The mark that would cause the NEXT load of each skill, cleared as that load
  // consumes it - which is what "since its last load" means operationally.
  const pending = new Map();
  const unfollowed = new Map(); // skill → fires not yet followed by a load

  const load = (skill, cause) => {
    (skillLoadsBy[skill] ??= emptyCauses())[cause] += 1;
    const fires = unfollowed.get(skill) ?? 0;
    if (fires > 0) {
      (triggerFires[skill] ??= { fired: 0, followed: 0 }).followed += fires;
      unfollowed.set(skill, 0);
    }
    pending.delete(skill);
  };

  for (const entry of entries ?? []) {
    // The entry's own marks first: a hook runs before the turn that records it, so
    // a block in the same entry as a load is what caused that load.
    for (const line of hookMarks(entry, seen)) {
      const mark = readMark(line);
      if (!mark) continue;
      if (mark.kind === 'guard') {
        for (const rule of mark.rules) (guardFires[rule] ??= { blocking: 0, advisory: 0 })[mark.severity] += 1;
        continue;
      }
      for (const skill of mark.skills) {
        pending.set(skill, mark.cause);
        if (mark.kind === 'block') skillBlocks[skill] = (skillBlocks[skill] ?? 0) + 1;
        else {
          (triggerFires[skill] ??= { fired: 0, followed: 0 }).fired += 1;
          unfollowed.set(skill, (unfollowed.get(skill) ?? 0) + 1);
        }
      }
    }

    for (const skill of skillToolLoads(entry)) load(skill, pending.get(skill) ?? 'voluntary');
    for (const skill of readLoads(entry, mounted)) load(skill, pending.get(skill) ?? 'read');
    const command = commandName(entry);
    if (command !== null && mounted.has(command)) load(command, pending.get(command) ?? 'command');
  }
  return { skillLoadsBy, skillBlocks, triggerFires, guardFires, toolCalls: countToolCalls(entries) };
}

// The moments a triggered skill's own declarations had in this session, counted
// with the resolver the hooks match with rather than a second reading of the same
// patterns. `hits` is `{ path, call, prompt }` - the engine's predicates, passed in
// by the caller, so an engine too old to export them records NO key at all, which
// reads as *not recorded* rather than as zero moments.
//
// A moment is an occasion a declaration named, whether or not the skill was already
// loaded: that is the denominator the review compares loads against, and deduping
// it to the hook's once-per-session behaviour would compare a number to itself.
const FILE_TOOLS = new Set(['Edit', 'Write', 'NotebookEdit']);
export function countMoments(entries, declarations = [], hits = {}) {
  if (!hits.call || !hits.prompt || !hits.path) return {};
  const out = {};
  const hit = (skill) => { out[skill] = (out[skill] ?? 0) + 1; };
  for (const entry of entries ?? []) {
    if (isUserMessage(entry) && typeof entry?.message?.content === 'string') {
      for (const d of declarations) if (d.kind === 'prompt' && hits.prompt(d, entry.message.content)) hit(d.skill);
      continue;
    }
    for (const call of toolCalls(entry)) {
      for (const d of declarations) {
        if (d.kind === 'toolCall') { if (hits.call(d, call)) hit(d.skill); continue; }
        if (!d.re || !FILE_TOOLS.has(call.name) || typeof call.input.file_path !== 'string') continue;
        if (hits.path(d, String(call.input.file_path).replace(/^\.?\//, ''))) hit(d.skill);
      }
    }
  }
  return out;
}
