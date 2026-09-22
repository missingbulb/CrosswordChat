// A skill's own declaration: the YAML frontmatter at the top of its SKILL.md, read
// for the fields the corpus acts on — `name`, `description` (what the harness
// matches a session's activity against) and, under `metadata`, the corpus's own
// keys: `body`, what kind of body follows (below), and
// `force-load-on-file-edits-paths`: the files a file tool may touch only with this
// skill loaded (the PreToolUse guard holds the edit until it is). `metadata` is the
// map the harness reserves for a reader's own keys and never acts on, which is why
// the scope lives there and not in the harness's `paths` — that field LIMITS when
// the harness offers a skill, and a skill forced for some files is often wanted
// elsewhere too. The rest of the frontmatter is the harness's business.
//
// A deliberate subset of YAML, never a general parser: `key: scalar`, a block list
// under a key (`- item`), one level of nested map under a key, quoted or bare
// scalars, and a comma-separated scalar where a list is expected. Anything else is
// left unread, and a file with no frontmatter — or a malformed one — reads as a skill
// with empty metadata, which is what the harness does with it too.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const FORCE_LOAD_KEY = 'force-load-on-file-edits-paths';
// The other three moments a skill may force itself for, under `metadata` too:
// a tool call, an owner prompt, a tool result. An entry is one scalar — single-
// quote it in the frontmatter, since a regex carries backslashes:
//   force-load-on-tool-calls:          - 'mcp__github__create_pull_request'
//                                      - 'Bash.command /(^|[;&|]\\s*)git\\s+commit\\b/'
//   force-load-on-prompts-matching:    - '/\\/do-later\\b/'
//   force-load-on-tool-results-matching: - 'WebFetch /EGRESS_BLOCKED|\\b403\\b/'
// A tool entry is the tool's exact name — optionally `.field`, the input field
// the regex reads (`Bash.command`) — or a /regex/ over names, then optionally a
// space and a /regex/ over that field, or over the whole input (or the result)
// serialized as JSON when no field is named.
export const TOOL_CALL_KEY = 'force-load-on-tool-calls';
export const PROMPT_KEY = 'force-load-on-prompts-matching';
export const TOOL_RESULT_KEY = 'force-load-on-tool-results-matching';
// What kind of body follows the frontmatter, declared under `metadata` too:
//   body: workflow     a procedure — steps and their gotchas change as one
//   body: guidelines   rules behind a trigger, each as independent as a RULES.md bullet
// Declared rather than inferred: the two shapes look alike from outside, and a
// skill that mixes steps and gotchas is classified by its author, not by a count.
// The corpus's maintenance tooling reads it; the harness never does. Absent, or a
// value outside the vocabulary, is undeclared (null) — never a default.
export const BODY_KEY = 'body';
export const BODIES = Object.freeze(['workflow', 'guidelines']);

// What usage the skill expects of itself, under `metadata` too - the declaration
// the usage review compares the record against, since without it zero loads is
// equally "exactly right" and "broken":
//   usage:
//     expect: triggered          # adoption | triggered | judgment
//
// Each value names HOW the skill expects to be reached, never how often. A rate
// an author states is a guess about the future, and a finding computed against
// one measures the guess rather than the skill; the three below are each a claim
// about a mechanism, which the record can actually contradict:
//
//   adoption   loaded while its pack is being adopted, and not after. Zero inside
//              that window is a finding; zero after it is the expectation met.
//   triggered  loaded by its own force-load declarations and nowhere else, so its
//              loads are judged against the moments those declarations named.
//   judgment   loaded when the model judges its description fits. Nothing follows
//              from a count either way, and only the always-loaded rule applies.
export const USAGE_KEY = 'usage';
export const EXPECTS = Object.freeze(['adoption', 'triggered', 'judgment']);

const RE_FORM = /^\/(.*)\/([a-z]*)$/s;
const toRegExp = (s) => { const m = RE_FORM.exec(String(s).trim()); try { return m ? new RegExp(m[1], m[2]) : null; } catch { return null; } };
const listAt = (fm, key) => {
  const v = fm?.metadata && typeof fm.metadata === 'object' && !Array.isArray(fm.metadata) ? fm.metadata[key] : undefined;
  return Array.isArray(v) ? v : typeof v === 'string' && v.trim() ? [v] : [];
};

// "<tool>", "<tool>.<field>", either with " /regex/" → { tool (name or RegExp),
// field (a dot path into the input, or null), pattern (RegExp or null), source };
// a malformed entry is null (dropped, never a wedged hook).
export function parseToolTrigger(entry) {
  const m = /^(\/(?:[^/\\]|\\.)*\/[a-z]*|[^\s/][^\s]*)(?:\s+(\/.*\/[a-z]*))?$/s.exec(String(entry).trim());
  if (!m) return null;
  let tool = m[1];
  let field = null;
  if (tool.startsWith('/')) { tool = toRegExp(tool); if (tool === null) return null; }
  else if (tool.includes('.')) { [tool, ...field] = tool.split('.'); field = field.join('.'); }
  const pattern = m[2] ? toRegExp(m[2]) : null;
  if (m[2] && !pattern) return null;
  return { tool, field, pattern, source: String(entry).trim() };
}
export const toolCallTriggersOf = (fm) => listAt(fm, TOOL_CALL_KEY).map(parseToolTrigger).filter(Boolean);
export const toolResultTriggersOf = (fm) => listAt(fm, TOOL_RESULT_KEY).map(parseToolTrigger).filter(Boolean);
export const promptTriggersOf = (fm) => listAt(fm, PROMPT_KEY)
  .map((s) => ({ re: toRegExp(s), source: String(s).trim() })).filter((p) => p.re);

const unquote = (s) => {
  const t = s.trim();
  return (t.length >= 2 && ((t[0] === '"' && t.at(-1) === '"') || (t[0] === "'" && t.at(-1) === "'")))
    ? t.slice(1, -1) : t;
};
const scalar = (rest) => {
  const flow = /^\[(.*)\]$/.exec(rest.trim());
  return flow ? flow[1].split(',').map(unquote).filter(Boolean) : unquote(rest);
};

export function parseFrontmatter(text) {
  const out = {};
  if (!text.startsWith('---')) return out;
  const end = text.indexOf('\n---', 3);
  if (end === -1) return out;
  const lines = text.slice(text.indexOf('\n') + 1, end).split('\n');
  // The containers open at this line, outermost first: a key with an empty value
  // opens one, and a line indented no further than the key that opened it closes
  // it. A container starts as a list and becomes a map the first time a key lands
  // inside it, which is what lets `metadata` hold both lists and nested maps, to
  // whatever depth they are written - `metadata.usage.expect` is three.
  const stack = []; // [{ key, indent, parent }]
  for (const line of lines) {
    if (!line.trim()) continue;
    const indent = line.length - line.trimStart().length;
    while (stack.length && indent <= stack.at(-1).indent) stack.pop();
    const open = stack.at(-1) ?? null;
    const item = /^\s+-\s*(.*)$/.exec(line);
    if (item && open) {
      const target = open.parent[open.key];
      if (Array.isArray(target)) target.push(unquote(item[1]));
      continue;
    }
    const kv = /^(\s*)([A-Za-z_][\w-]*):\s*(.*)$/.exec(line);
    if (!kv) continue;
    const [, , key, rest] = kv;
    let target = out;
    if (open) {
      if (Array.isArray(open.parent[open.key]) && !open.parent[open.key].length) open.parent[open.key] = {};
      target = open.parent[open.key];
      if (typeof target !== 'object' || Array.isArray(target)) continue;
    }
    target[key] = rest.trim() === '' ? [] : scalar(rest);
    if (rest.trim() === '') stack.push({ key, indent, parent: target });
  }
  return out;
}

// The forced-load scope as a list whatever its spelling — a block list, a flow list,
// or one comma-separated string — read from `metadata`.
export function forceLoadPathsOf(fm) {
  const v = fm?.metadata && typeof fm.metadata === 'object' && !Array.isArray(fm.metadata) ? fm.metadata[FORCE_LOAD_KEY] : undefined;
  if (Array.isArray(v)) return v;
  return typeof v === 'string' ? v.split(',').map((s) => s.trim()).filter(Boolean) : [];
}

// The declared body: 'workflow', 'guidelines', or null when undeclared.
export function bodyOf(fm) {
  const v = fm?.metadata && typeof fm.metadata === 'object' && !Array.isArray(fm.metadata) ? fm.metadata[BODY_KEY] : undefined;
  return typeof v === 'string' && BODIES.includes(v.trim()) ? v.trim() : null;
}

// The declared `usage` block: null where there is none - undeclared is a state of
// its own, which the review lists rather than judges - else
// { expect, problems }. A mis-declaration keeps its place here with `problems`
// naming what is wrong, so the authoring-time check and the review read one
// vocabulary instead of two: the check reports the problems, the review evaluates
// a block only when there are none.
//
// `expect` is the block's only key. A second key is refused rather than ignored:
// the block exists so a reader can tell what a zero means, and a key nothing reads
// would be a claim the record never tests.
export function usageOf(fm) {
  const md = fm?.metadata;
  const v = md && typeof md === 'object' && !Array.isArray(md) ? md[USAGE_KEY] : undefined;
  if (v === undefined) return null;
  if (!v || typeof v !== 'object' || Array.isArray(v)) return { expect: null, problems: [`${USAGE_KEY} is not a block of keys`] };
  const problems = [];
  const expect = typeof v.expect === 'string' ? v.expect.trim() : '';
  if (!EXPECTS.includes(expect)) {
    problems.push(expect ? `expect: ${expect} is outside ${EXPECTS.join(' | ')}` : `expect is missing - one of ${EXPECTS.join(' | ')}`);
  }
  for (const key of Object.keys(v)) {
    if (key !== 'expect') problems.push(`${key} is not a key of the usage block, whose only key is expect`);
  }
  return { expect: EXPECTS.includes(expect) ? expect : null, problems };
}

// The metadata of the skill at `dir`: { name, description, body, usage, forceLoadPaths,
// toolCallTriggers, promptTriggers, toolResultTriggers }.
// Unreadable is empty metadata, on the harness's own terms.
export function skillMetadata(dir) {
  let fm = {};
  try { fm = parseFrontmatter(readFileSync(join(dir, 'SKILL.md'), 'utf8')); } catch { /* no SKILL.md */ }
  return {
    name: typeof fm.name === 'string' ? fm.name : '',
    description: typeof fm.description === 'string' ? fm.description : '',
    body: bodyOf(fm),
    usage: usageOf(fm),
    forceLoadPaths: forceLoadPathsOf(fm),
    toolCallTriggers: toolCallTriggersOf(fm),
    promptTriggers: promptTriggersOf(fm),
    toolResultTriggers: toolResultTriggersOf(fm),
  };
}
