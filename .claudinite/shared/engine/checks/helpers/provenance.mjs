import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { parseFrontmatter, bodyOf } from '../../pack_loader/skill-frontmatter.mjs';
import { PROSE_FILE, SKILLS_DIR, RULE_DIRS, PROVENANCE_DIR } from '../../pack_loader/pack-conventions.mjs';

// THE PROVENANCE LOG'S MECHANISM: the file grammar, the marker that binds a prose
// rule to its file, how a pack's carriers are enumerated and which file each one
// names, and the two codemods that put a pack onto the convention (`markPack`,
// `convertReferences`). Every reader and writer of a `provenance/` folder composes
// this - the growth pack's checks and CLI, the migration-registry op that marks a
// member's local packs at converge - so the grammar is spelled once, here, and
// nothing below carries a rule's failure text or a command's wording (those are the
// callers'). The convention itself - what an element is, what an entry records, what
// is never vendored - is docs/provenance/DESIGN.md's; this module is what it says a
// file looks like.
//
// io is injected everywhere - `{ read, write, exists, listDir, remove? }` over
// repo-relative posix paths - so the same code runs over a checkout (the CLI) and
// inside the registry's record io (a member's converge) without a second
// implementation.

export { PROVENANCE_DIR };

// The pack's own file and the declined log, each sorted ahead of every element by
// the underscore. `_pack` is also the id the manifest names.
export const PACK_ELEMENT = '_pack';
export const DECLINED_FILE = '_declined.md';

// The closed kind vocabulary, and the kinds whose entry always carries Mechanism.
export const KINDS = Object.freeze(['born', 'reworded', 'strengthened', 'weakened', 'split', 'merged', 'moved',
  'converted', 'trigger-changed', 'policy-changed', 'severity-changed', 'scope-changed', 'reaffirmed', 'promoted', 'retired']);
export const MECHANISM_KINDS = Object.freeze(['born', 'converted', 'moved', 'trigger-changed', 'policy-changed', 'severity-changed', 'scope-changed']);
export const FIELDS = Object.freeze(['Source', 'Reason', 'Actor', 'Model', 'Mechanism', 'Rejected', 'Retire when', 'Landed']);
export const DECLINED_KIND = 'declined';

// A slug marker ends a rule's last line: two to four hyphenated words, so a plain
// parenthetical (`(canon)`, `(see below)`), an issue (`(#1119)`) and the retired
// numeric marker (`(3)`, `(3, 7)`) never read as one.
export const SLUG_RE = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)+$/;
const MARKER_AT_END = /\s*\(([a-z][a-z0-9]*(?:-[a-z0-9]+)+)\)\s*$/;
// The numeric marker the references convention used - `(3)`, `(3, 7)`, `(2a)`, and the
// `(RULES-14)` spelling some rules took - read only so the conversion can replace it.
const NUMERIC_MARKER_AT_END = /\s*\((?:RULES-)?(\d+[a-z]?(?:\s*,\s*\d+[a-z]?)*)\)\s*$/;

const RULE_BULLET = /^- \*\*/;
const TOP_BULLET = /^- /;
const NESTED_ITEM = /^\s+(?:[-*+]|\d+\.)\s/;
const HEADING = /^#{1,6}\s+/;
const NUMBERED_STEP = /^\d+\.\s/;
const ENTRY_HEAD = /^## (\d{4}-\d{2}-\d{2}) · ([a-z-]+) · (.+?)\s*$/;
const FIELD_LINE = /^- \*\*([A-Z][A-Za-z ]*?):\*\*\s*(.*)$/;

// A check's id becomes a file name with its slash as a hyphen (`cer/x` → `cer-x.md`);
// every element file is its id and `.md`, the pack's own and the declined log leading
// with an underscore.
const ELEMENT_FILE = /^_?[a-z0-9]+(?:-[a-z0-9]+)*\.md$/;
// The title `convertReferences` writes, which is how a conversion-filled file is known
// again afterwards.
const CONVERTED_TITLE = /^converted from references\.md \(/;
export const elementIdOf = (id) => String(id).replace(/\//g, '-');
export const fileOfId = (id) => `${elementIdOf(id)}.md`;
export const idOfFile = (name) => name.replace(/\.md$/, '');

// --- the file grammar --------------------------------------------------------------

// Every entry of a provenance file, in file order, with its fields and the grammar
// faults found on the way. A file is its entries and nothing else: a header, front
// matter or prose outside an entry is a fault, since it is the one part of the file
// that invites editing. `kinds` is the vocabulary the file admits - the element
// kinds, or the declined log's one kind.
export function parseEntries(text, { kinds = KINDS } = {}) {
  const entries = [];
  const errors = [];
  const lines = String(text ?? '').split('\n');
  let current = null;
  let lastDate = '';
  lines.forEach((raw, i) => {
    const line = raw.replace(/\r$/, '');
    const n = i + 1;
    const head = ENTRY_HEAD.exec(line);
    if (head) {
      const [, date, kind, title] = head;
      if (!kinds.includes(kind)) errors.push({ line: n, what: `entry kind "${kind}" is not in the vocabulary` });
      if (Number.isNaN(Date.parse(`${date}T00:00:00Z`))) errors.push({ line: n, what: `entry date "${date}" is not a date` });
      else if (date < lastDate) errors.push({ line: n, what: `entry dated ${date} follows one dated ${lastDate}; entries are appended in date order` });
      lastDate = date > lastDate ? date : lastDate;
      current = { date, kind, title, line: n, fields: {}, order: [], last: null };
      entries.push(current);
      return;
    }
    if (line.startsWith('## ')) {
      errors.push({ line: n, what: 'entry heading does not read "## <YYYY-MM-DD> · <kind> · <one line>"' });
      current = null;
      return;
    }
    if (!line.trim()) return;
    if (!current) {
      errors.push({ line: n, what: 'text outside an entry - a file is its entries and nothing else' });
      return;
    }
    const field = FIELD_LINE.exec(line);
    if (field) {
      const [, name, value] = field;
      if (!FIELDS.includes(name)) errors.push({ line: n, what: `field "${name}" is not in the vocabulary (${FIELDS.join(', ')})` });
      if (!value.trim()) errors.push({ line: n, what: `field "${name}" is empty - a field with nothing behind it is omitted, never filled` });
      if (name in current.fields) errors.push({ line: n, what: `field "${name}" repeats within one entry` });
      current.fields[name] = value.trim();
      current.order.push(name);
      current.last = name;
      return;
    }
    if (/^\s{2,}\S/.test(line) && current.last) {
      current.fields[current.last] = `${current.fields[current.last]} ${line.trim()}`;
      return;
    }
    errors.push({ line: n, what: 'line is neither a "- **Field:** …" bullet nor an indented continuation of one' });
  });
  return { entries, errors };
}

// live: the element stands (an empty file is an element whose history is not yet
// written); retired: its last entry retired it.
export function elementStatus(entries) {
  return entries.length && entries[entries.length - 1].kind === 'retired' ? 'retired' : 'live';
}

// Faults of a parsed file beyond the line grammar: the first entry is `born`, and
// every mechanism-bearing kind carries Mechanism.
export function entryFaults(entries) {
  const out = [];
  entries.forEach((e, i) => {
    if (i === 0 && e.kind !== 'born') out.push({ line: e.line, what: `the first entry is "${e.kind}", and a file with entries opens with born` });
    if (MECHANISM_KINDS.includes(e.kind) && !('Mechanism' in e.fields)) out.push({ line: e.line, what: `a ${e.kind} entry carries no Mechanism` });
  });
  return out;
}

// Render one entry in the file grammar. `fields` is an ordered object; a field with
// nothing behind it is not written. Continuation lines are wrapped at `width` bytes
// and indented, so a long field reads in a diff.
export function renderEntry({ date, kind, title, fields = {} }, { width = 100 } = {}) {
  const lines = [`## ${date} · ${kind} · ${title}`];
  for (const [name, value] of Object.entries(fields)) {
    if (value === undefined || value === null || String(value).trim() === '') continue;
    lines.push(...wrapField(`- **${name}:** ${String(value).replace(/\s+/g, ' ').trim()}`, width));
  }
  return `${lines.join('\n')}\n`;
}

function wrapField(text, width) {
  if (Buffer.byteLength(text) <= width) return [text];
  const out = [];
  let cur = '';
  for (const w of text.split(' ')) {
    const next = cur ? `${cur} ${w}` : w;
    if (cur && Buffer.byteLength(next) > width) { out.push(cur); cur = `  ${w}`; } else cur = next;
  }
  if (cur) out.push(cur);
  return out;
}

// The grammar faults of one entry on its own, before the file it would join is read.
export function entryProblems(entry, { kinds = KINDS } = {}) {
  const problems = [];
  if (!kinds.includes(entry.kind)) problems.push(`kind "${entry.kind}" is not in the vocabulary (${kinds.join(', ')})`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.date ?? '') || Number.isNaN(Date.parse(`${entry.date}T00:00:00Z`))) problems.push(`date "${entry.date}" is not a YYYY-MM-DD date`);
  if (!entry.title || !String(entry.title).trim()) problems.push('an entry needs its one-line title');
  for (const name of Object.keys(entry.fields ?? {})) if (!FIELDS.includes(name)) problems.push(`field "${name}" is not in the vocabulary`);
  if (MECHANISM_KINDS.includes(entry.kind) && !String(entry.fields?.Mechanism ?? '').trim()) problems.push(`a ${entry.kind} entry carries Mechanism: the carrier and its trigger, and why`);
  return problems;
}

// Validate an entry against the grammar and the file it would join, then return the
// text to write back. Refuses rather than writes: the caller decides what a refusal
// costs. `firstKind` is what an empty file's first entry must be (null: anything).
// This is the ordinary lane, and it is append-only: an entry dated before the file's
// last one is refused, because a change being recorded now cannot have happened before
// the change recorded last. The backfill is the one lane that writes the past, and it
// goes through `backfilledText` instead.
export function appendedText(existing, entry, { kinds = KINDS, firstKind = 'born' } = {}) {
  const problems = entryProblems(entry, { kinds });
  const { entries, errors } = parseEntries(existing, { kinds });
  if (errors.length) problems.push(`the file does not parse (line ${errors[0].line}: ${errors[0].what})`);
  const last = entries[entries.length - 1];
  if (last && entry.date < last.date) problems.push(`the file's last entry is dated ${last.date}; an entry is appended in date order`);
  if (last && last.kind === 'retired') problems.push('the element is retired; a retired file is appended to by nothing');
  if (!entries.length && firstKind && entry.kind !== firstKind) problems.push(`the first entry of a file is ${firstKind}, not ${entry.kind}`);
  if (problems.length) return { problems };
  const body = renderEntry(entry);
  const text = String(existing ?? '');
  if (text.trim() === '') return { problems: [], text: body };
  const glue = text.endsWith('\n\n') ? '' : text.endsWith('\n') ? '\n' : '\n\n';
  return { problems: [], text: `${text}${glue}${body}` };
}

// One parsed entry as `renderEntry` takes it, its fields in the file's own order.
const asEntry = (e) => ({ date: e.date, kind: e.kind, title: e.title, fields: Object.fromEntries(e.order.map((n) => [n, e.fields[n]])) });
const headingOf = (e) => `${e.date} · ${e.kind} · ${e.title}`;

// The backfill's write, and the ONE place a provenance file is rewritten rather than
// appended to. A backfill derives an element's whole history at once from commits that
// are already in the past, so its entries are dated before whatever the file holds -
// which the append lane refuses, correctly, for every other caller. Here the file is
// re-rendered from its existing entries and the batch merged in date order.
//
// A file the references conversion filled carries a placeholder `born` dated by the
// conversion write rather than by the element's birth. Where the batch supplies a born
// dated EARLIER, that placeholder is the thing being corrected, so it is dropped and
// named in `superseded`; where the placeholder's date is the real birth, no earlier
// born arrives and it stands. That distinction is read off the dates rather than left
// to the run, which is why this is the tool's job and not a prompt's (#2223).
export function backfilledText(existing, entries, { kinds = KINDS, firstKind = 'born' } = {}) {
  const problems = [];
  for (const e of entries) problems.push(...entryProblems(e, { kinds }));
  const { entries: held, errors } = parseEntries(existing, { kinds });
  if (errors.length) problems.push(`the file does not parse (line ${errors[0].line}: ${errors[0].what})`);
  if (problems.length) return { problems, superseded: [] };
  const born = entries.filter((e) => e.kind === 'born').map((e) => e.date).sort()[0];
  const superseded = [];
  const keep = held.map(asEntry).filter((e) => {
    // Only the conversion's own placeholder is replaced, never an entry somebody wrote:
    // a batch carrying an earlier born would otherwise silently delete real history, and
    // the point of this lane is to correct a date the conversion never knew.
    if (born && e.kind === 'born' && e.date > born && CONVERTED_TITLE.test(e.title ?? '')) { superseded.push(headingOf(e)); return false; }
    return true;
  });
  const merged = [...keep];
  for (const e of entries) if (!merged.some((m) => headingOf(m) === headingOf(e))) merged.push(e);
  // A stable sort by date alone: entries of one day keep the order they arrived in,
  // the file's own first and then the batch's, which is the order a run wrote them.
  const ordered = merged.map((e, i) => ({ e, i })).sort((a, b) => a.e.date.localeCompare(b.e.date) || a.i - b.i).map(({ e }) => e);
  if (ordered.length && firstKind && ordered[0].kind !== firstKind) problems.push(`the file would open with ${ordered[0].kind}; the first entry of a file is ${firstKind}`);
  const retiredAt = ordered.findIndex((e) => e.kind === 'retired');
  if (retiredAt !== -1 && retiredAt !== ordered.length - 1) problems.push(`a retired entry is a file's last; "${headingOf(ordered[retiredAt])}" would sit above ${ordered.length - 1 - retiredAt} more`);
  if (ordered.filter((e) => e.kind === 'born').length > 1) problems.push('the batch would leave two born entries in one file; an element is born once');
  if (problems.length) return { problems, superseded };
  return { problems: [], superseded, text: ordered.map((e) => renderEntry(e)).join('\n') };
}

// Parse an entry written in the file grammar (what `append` reads from stdin).
export function parseEntryText(text) {
  const { entries, errors } = parseEntries(text, { kinds: [...KINDS, DECLINED_KIND] });
  if (entries.length !== 1) return { problems: [`expected exactly one entry, found ${entries.length}`] };
  if (errors.length) return { problems: errors.map((e) => `line ${e.line}: ${e.what}`) };
  const e = entries[0];
  const fields = {};
  for (const name of e.order) fields[name] = e.fields[name];
  return { problems: [], entry: { date: e.date, kind: e.kind, title: e.title, fields } };
}

// --- the carriers ------------------------------------------------------------------

// The top-level rule bullets of a prose file: `- **lead-in** …` and every line that
// belongs to it (continuation, sub-bullets, blank lines inside the block), closed by
// the next top-level bullet or a heading. With `plainBullets`, a top-level bullet with
// no bold lead-in is a rule too - a guidelines skill's bullets are its rules whatever
// their typography - and its trigger is the opening words. The marker ends the rule's
// lead paragraph - its last line before a nested list or a blank line - or, where a
// rule was marked after its nested list, the block's last non-blank line; `lastLine`
// is where it is, or where a writer puts one, and `end` is the block's last non-blank
// line. `numeric` is the retired numeric marker, read only so the conversion can
// replace it. Indices are 0-based.
export function ruleBlocks(text, { plainBullets = false } = {}) {
  const lines = String(text ?? '').split('\n');
  const blocks = [];
  let cur = null;
  const readAt = (i) => {
    const slug = MARKER_AT_END.exec(lines[i])?.[1] ?? null;
    return { slug, numeric: slug ? null : NUMERIC_MARKER_AT_END.exec(lines[i])?.[1] ?? null };
  };
  const close = () => {
    if (!cur) return;
    let end = cur.end;
    while (end > cur.start && !lines[end].trim()) end--;
    let para = cur.start;
    for (let i = cur.start + 1; i <= end && lines[i].trim() && !NESTED_ITEM.test(lines[i]); i++) para = i;
    let at = readAt(para);
    let lastLine = para;
    if (!at.slug && !at.numeric && end !== para) {
      const tail = readAt(end);
      if (tail.slug || tail.numeric) { at = tail; lastLine = end; }
    }
    const body = lines.slice(cur.start, end + 1).map((l, i) => (cur.start + i === lastLine ? stripMarkers(l) : l)).join('\n');
    const lead = RULE_BULLET.test(lines[cur.start]) ? /\*\*([\s\S]+?)\*\*/.exec(body) : null;
    blocks.push({
      start: cur.start, end, lastLine, slug: at.slug, numeric: at.numeric,
      trigger: lead ? normalizeLeadIn(lead[1]) : openingWords(stripMarkers(lines[cur.start]).replace(/^- /, '')),
      text: normalizeRuleText(body),
    });
    cur = null;
  };
  // A fenced code block is opaque: a `- **Field:** …` line inside one is an example,
  // not a rule, and it neither opens a block nor ends one.
  let fenced = false;
  lines.forEach((line, i) => {
    if (/^\s*```/.test(line)) { fenced = !fenced; if (cur) cur.end = i; return; }
    if (fenced) { if (cur) cur.end = i; return; }
    if (RULE_BULLET.test(line) || (plainBullets && TOP_BULLET.test(line))) { close(); cur = { start: i, end: i }; return; }
    if (TOP_BULLET.test(line) || HEADING.test(line)) { close(); return; }
    if (cur) cur.end = i;
  });
  close();
  return blocks;
}

export const normalizeLeadIn = (s) => s.replace(/[`*_]/g, '').replace(/\s+/g, ' ').trim().replace(/\p{Pd}$/u, '').trim();

// A plain bullet's trigger: its first clause, or its first eight words.
const openingWords = (s) => {
  const clean = normalizeLeadIn(s);
  const clause = clean.split(/\s[\p{Pd}:]\s|[.:;]\s|[.!?]$/u)[0];
  return clause.split(' ').slice(0, 8).join(' ');
};

const stripMarkers = (line) => line.replace(MARKER_AT_END, '').replace(NUMERIC_MARKER_AT_END, '');

// A rule's text as a decision reads it: the marker off, whitespace collapsed. Two
// rules with the same normalized text were not reworded - a re-wrap, a marker added
// or renamed is not a change an entry is owed for.
export function normalizeRuleText(block) {
  return String(block).split('\n').map(stripMarkers).join(' ').replace(/\s+/g, ' ').trim();
}

// What a skill's frontmatter says of itself, plus the shape `mark` proposes a body
// from: bold-trigger bullets and no numbered steps read as guidelines, anything else as
// a workflow. `bodyOffset` is how many lines the frontmatter takes, so a bullet's
// line in the body maps to its line in the file.
export function skillShape(text) {
  const src = String(text ?? '');
  const fm = parseFrontmatter(src);
  const end = src.startsWith('---') ? src.indexOf('\n---', 3) : -1;
  const bodyStart = end === -1 ? 0 : src.indexOf('\n', end + 1) + 1;
  const bodyText = src.slice(bodyStart);
  const bullets = ruleBlocks(bodyText, { plainBullets: true });
  const steps = bodyText.split('\n').filter((l) => NUMBERED_STEP.test(l)).length;
  return {
    body: bodyOf(fm),
    proposed: bullets.some((b) => RULE_BULLET.test(bodyText.split('\n')[b.start])) && !steps ? 'guidelines' : 'workflow',
    bullets,
    bodyOffset: src.slice(0, bodyStart).split('\n').length - 1,
  };
}

const readJson = (io, p) => { try { return JSON.parse(io.read(p) ?? 'null'); } catch { return null; } };
const isDir = (io, p) => io.listDir(p) !== null;
const listDirs = (io, p) => (io.listDir(p) ?? []).filter((n) => !n.startsWith('.') && isDir(io, `${p}/${n}`)).sort();
const listFiles = (io, p) => (io.listDir(p) ?? []).filter((n) => !isDir(io, `${p}/${n}`)).sort();

// The `id:` a rule module declares - every string literal assigned to an `id` key,
// which is how every coded rule in the corpus spells it.
export function checkIdsIn(source) {
  const out = [];
  const re = /\bid\s*:\s*['"]([^'"]+)['"]/g;
  let m;
  while ((m = re.exec(String(source ?? ''))) !== null) out.push(m[1]);
  return out;
}

// The sibling modules a file imports or re-exports, relative specifiers only: what a
// thin aggregator names when the ids live beside it rather than in its own text.
export function relativeModulesIn(source) {
  const out = [];
  const re = /\bfrom\s*['"](\.{1,2}\/[^'"]+\.mjs)['"]/g;
  let m;
  while ((m = re.exec(String(source ?? ''))) !== null) if (!out.includes(m[1])) out.push(m[1]);
  return out;
}

// The checks a module carries, following its re-exports: an aggregator's ids live in
// the modules it names, and the file that DECLARES a check is the one a decision about
// it changes, so that is the file each id is carried by. Without the follow an
// aggregated check is carried by nothing, which no fault reports - its history simply
// has nowhere to land (#2222).
export function checksOfModule(io, file, within = null, seen = new Set()) {
  if (seen.has(file)) return [];
  seen.add(file);
  const source = io.read(file) ?? '';
  const own = checkIdsIn(source).map((id) => ({ id, file }));
  // Only a file declaring NO id of its own is an aggregator. One that declares an id is a
  // check module, and the modules it names are its helpers - reading their `id:` literals
  // turns a documented example or an unrelated key into a carrier that no provenance file
  // will ever have, which reads as a fault in a pack nobody touched.
  if (own.length) return own;
  const dir = file.replace(/\/[^/]+$/, '');
  const out = [...own];
  for (const rel of relativeModulesIn(source)) {
    const resolved = normalizePath(`${dir}/${rel}`);
    // A module outside the pack is shared engine code, never one of the pack's carriers.
    if (within && !resolved.startsWith(`${within}/`)) continue;
    if (io.exists(resolved)) out.push(...checksOfModule(io, resolved, within, seen));
  }
  return out.filter((c, i) => out.findIndex((o) => o.id === c.id) === i);
}

// `a/b/../c.mjs` as `a/c.mjs`: the io reads a literal path, so a `..` specifier has to
// be resolved before it is asked for.
function normalizePath(path) {
  const parts = [];
  for (const part of path.split('/')) {
    if (part === '.' || part === '') continue;
    if (part === '..') { parts.pop(); continue; }
    parts.push(part);
  }
  return parts.join('/');
}

// Every carrier of the pack at `packDir` and the file each names:
//   rules       [{ file, line, lastLine, trigger, slug, numeric, text }]   RULES.md bullets (1-based lines)
//   guidelines  [{ file, skill, line, lastLine, trigger, slug, numeric, text }]   a guidelines skill's bullets
//   skills      [{ name, file, body, proposed, bullets }]
//   checks      [{ id, file }]   coded rule modules and declared checks, by id
//   tasks       [{ id, dir }]
// The manifest names `_pack` whenever the pack has one.
export function packCarriers(packDir, io) {
  const rules = [];
  const guidelines = [];
  const skills = [];
  const checks = [];
  const tasks = [];
  const declarations = [];
  const prose = `${packDir}/${PROSE_FILE}`;
  if (io.exists(prose)) {
    for (const b of ruleBlocks(io.read(prose))) rules.push({ file: prose, line: b.start + 1, lastLine: b.lastLine + 1, trigger: b.trigger, slug: b.slug, numeric: b.numeric, text: b.text });
  }
  for (const name of listDirs(io, `${packDir}/${SKILLS_DIR}`)) {
    const dir = `${packDir}/${SKILLS_DIR}/${name}`;
    const file = `${dir}/SKILL.md`;
    const skill = { name, file, body: null, proposed: 'workflow', bullets: [], present: io.exists(file) };
    if (skill.present) {
      const shape = skillShape(io.read(file));
      skill.body = shape.body;
      skill.proposed = shape.proposed;
      skill.bullets = shape.bullets.map((b) => ({ file, skill: name, line: shape.bodyOffset + b.start + 1, lastLine: shape.bodyOffset + b.lastLine + 1, endLine: shape.bodyOffset + b.end + 1, trigger: b.trigger, slug: b.slug, numeric: b.numeric, text: b.text }));
    }
    skills.push(skill);
    if (skill.body === 'guidelines') guidelines.push(...skill.bullets);
    if (io.exists(`${dir}/checks.mjs`)) checks.push(...checksOfModule(io, `${dir}/checks.mjs`, packDir));
    const declared = readJson(io, `${dir}/declared-checks.json`);
    if (Array.isArray(declared)) for (const d of declared) if (typeof d?.id === 'string') checks.push({ id: d.id, file: `${dir}/declared-checks.json` });
  }
  for (const scope of RULE_DIRS) {
    for (const f of listFiles(io, `${packDir}/${scope}`)) {
      if (!f.endsWith('.mjs') || f.endsWith('.test.mjs')) continue;
      const p = `${packDir}/${scope}/${f}`;
      for (const id of checkIdsIn(io.read(p))) checks.push({ id, file: p });
    }
  }
  const declared = readJson(io, `${packDir}/declared-checks.json`);
  if (Array.isArray(declared)) for (const d of declared) if (typeof d?.id === 'string') checks.push({ id: d.id, file: `${packDir}/declared-checks.json` });
  for (const t of listDirs(io, `${packDir}/tasks`)) {
    const dir = `${packDir}/tasks/${t}`;
    if (io.exists(`${dir}/task.json`) || io.exists(`${dir}/task.md`)) tasks.push({ id: t, dir, file: `${dir}/${io.exists(`${dir}/task.json`) ? 'task.json' : 'task.md'}` });
  }
  // A pack may declare a set of elements as DATA rather than as prose or code -
  // `<something>-rules.json` at the pack root, `{ "rules": [{ "id" }, …] }`. Each
  // entry is a carrier like any other: it decides something, so it has a file and
  // a log. Read by shape rather than by filename, the way declared-checks.json
  // already is, so the engine learns no one pack's vocabulary.
  for (const f of listFiles(io, packDir)) {
    if (!f.endsWith('-rules.json')) continue;
    const doc = readJson(io, `${packDir}/${f}`);
    for (const d of doc?.rules ?? []) if (typeof d?.id === 'string') declarations.push({ id: d.id, file: `${packDir}/${f}` });
  }
  return { rules, guidelines, skills, checks, tasks, declarations, manifest: io.exists(`${packDir}/pack.mjs`) };
}

// The provenance files of a pack: id → { file, text, entries, errors, status, empty }.
export function provenanceFiles(packDir, io) {
  const dir = `${packDir}/${PROVENANCE_DIR}`;
  const out = new Map();
  for (const name of listFiles(io, dir)) {
    // An element's file is named by its id; a record kept beside them under another
    // name (a pack's version log) is not an element and is parsed by nobody here.
    if (!ELEMENT_FILE.test(name) || name === DECLINED_FILE) continue;
    const file = `${dir}/${name}`;
    const text = io.read(file) ?? '';
    const { entries, errors } = parseEntries(text);
    out.set(idOfFile(name), {
      file, text, entries, errors, status: elementStatus(entries),
      empty: text.trim() === '',
      // A file the references conversion filled and nothing has since: it holds the
      // element's rationale but not its history, and its one entry is dated by the
      // conversion write rather than by the element. It owes a backfill exactly as an
      // empty file does, and reads as filled to anything counting bytes (#2223).
      convertedOnly: entries.length === 1 && CONVERTED_TITLE.test(entries[0].title ?? ''),
    });
  }
  return out;
}

// The pack directories a file list reaches, under both roots: the canon's shelf and a
// member's local packs. A directory counts when a file of it is listed, so an audit
// covers exactly what the run scans.
export const PACK_ROOTS = Object.freeze(['packs', '.claudinite/local/packs']);
export function packDirsIn(files) {
  const dirs = new Set();
  for (const f of files) {
    const p = f.replace(/\\/g, '/');
    for (const root of PACK_ROOTS) {
      if (!p.startsWith(`${root}/`)) continue;
      const rest = p.slice(root.length + 1);
      const cut = rest.indexOf('/');
      if (cut > 0) dirs.add(`${root}/${rest.slice(0, cut)}`);
    }
  }
  return [...dirs].sort();
}

// --- the audit --------------------------------------------------------------------

// Everything an integrity check judges about one pack, as facts. Each item carries
// the file and line it points at; the caller writes the finding text.
export function auditPack(packDir, io) {
  const carriers = packCarriers(packDir, io);
  const files = provenanceFiles(packDir, io);
  const named = new Set();
  const out = {
    packDir, carriers, files,
    unmarked: [],          // a RULES.md rule with no marker: { file, line, trigger }
    dangling: [],          // a marker or id naming no live file: { file, line, id, carrier, retired }
    unnamed: [],           // a live file no carrier names: { file, id }
    noBody: [],            // a skill declaring no body: { file, skill }
    markerInWorkflow: [],  // a workflow skill's bullet ending with a marker: { file, line, trigger, slug }
    parseErrors: [],       // { file, line, what }
    entryFaults: [],       // { file, line, what }
    empty: [],             // { file, id } - pending history
    convertedOnly: [],     // { file, id } - filled by the conversion, so history is pending too
    declined: null,        // { file, entries } - the turned-down candidates, listed beside the elements
    referencesDoc: io.exists(`${packDir}/references.md`) ? `${packDir}/references.md` : null,
  };
  const name = (id, carrier, at) => {
    named.add(id);
    const f = files.get(id);
    if (!f || f.status !== 'live') out.dangling.push({ ...at, id, carrier, retired: !!f });
  };
  for (const r of carriers.rules) {
    if (!r.slug) out.unmarked.push({ file: r.file, line: r.line, trigger: r.trigger });
    else name(r.slug, `rule "${r.trigger}"`, { file: r.file, line: r.lastLine });
  }
  // A guidelines skill's bullet names a file of its own only where its history has
  // diverged from the skill's; unmarked, it is the skill's, whose file the skill names.
  for (const g of carriers.guidelines) {
    if (g.slug) name(g.slug, `guideline "${g.trigger}"`, { file: g.file, line: g.lastLine });
  }
  for (const s of carriers.skills) {
    if (!s.present) continue;
    if (!s.body) out.noBody.push({ file: s.file, skill: s.name });
    if (s.body === 'workflow') for (const b of s.bullets) if (b.slug) out.markerInWorkflow.push({ file: b.file, line: b.lastLine, trigger: b.trigger, slug: b.slug });
    name(s.name, `skill ${s.name}`, { file: s.file, line: null });
  }
  for (const c of carriers.checks) name(elementIdOf(c.id), `check ${c.id}`, { file: c.file, line: null });
  for (const t of carriers.tasks) name(t.id, `task ${t.id}`, { file: t.file, line: null });
  for (const d of carriers.declarations) name(d.id, `declared rule ${d.id}`, { file: d.file, line: null });
  if (carriers.manifest) name(PACK_ELEMENT, 'the manifest', { file: `${packDir}/pack.mjs`, line: null });
  for (const [id, f] of files) {
    for (const e of f.errors) out.parseErrors.push({ file: f.file, line: e.line, what: e.what });
    for (const e of entryFaults(f.entries)) out.entryFaults.push({ file: f.file, line: e.line, what: e.what });
    if (f.empty) out.empty.push({ file: f.file, id });
    if (f.convertedOnly) out.convertedOnly.push({ file: f.file, id });
    if (f.status === 'live' && !named.has(id)) out.unnamed.push({ file: f.file, id });
  }
  const declined = `${packDir}/${PROVENANCE_DIR}/${DECLINED_FILE}`;
  if (io.exists(declined)) {
    const { entries, errors } = parseEntries(io.read(declined), { kinds: [DECLINED_KIND] });
    for (const e of errors) out.parseErrors.push({ file: declined, line: e.line, what: e.what });
    out.declined = { file: declined, entries };
  }
  return out;
}

// --- the slug a marking pass proposes --------------------------------------------

// The lead-in's verb ("Doing", "Wanting", "Passing") is what the slug reads by, so it
// is never a stop word; only articles, prepositions and pronouns are.
const STOP = new Set('a an the of to in on for with and or that this its it is are by from at as into over under when whose which what your you own one two than then not no never every any some more most so if else where while about after before between through via per vs there here their them they he she we us our my me i how why who whom'.split(' '));

// Two to four hyphenated words off the rule's lead-in - a proposal, refined by a
// maintainer before the change lands, and unique within the pack.
export function proposeSlug(trigger, taken = new Set()) {
  const words = String(trigger).toLowerCase().replace(/[`*_"'’]/g, '').replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean);
  let picked = words.filter((w) => !STOP.has(w) && w.length > 1).slice(0, 3);
  if (picked.length < 2) picked = [...new Set([...picked, ...words])].slice(0, 2);
  while (picked.length < 2) picked.push('rule');
  const base = picked.join('-').replace(/^[^a-z]+/, '');
  const safe = SLUG_RE.test(base) ? base : `${base.replace(/[^a-z0-9-]/g, '').replace(/^-+|-+$/g, '') || 'rule'}-rule`;
  let slug = safe;
  for (let n = 2; taken.has(slug); n++) slug = `${safe}-${n}`;
  return slug;
}

// --- the codemods ------------------------------------------------------------------

// Put the marker on a rule's last line, or on a continuation line of its own when the
// line would pass `width` bytes - one appended line, so a marking diff reads as
// exactly what it is. A retired numeric marker on that line goes.
function markLine(lines, index, slug, width) {
  const base = lines[index].replace(NUMERIC_MARKER_AT_END, '').replace(/\s+$/, '');
  const marked = `${base} (${slug})`;
  if (Buffer.byteLength(marked) <= width) { lines[index] = marked; return; }
  const indent = TOP_BULLET.test(base) ? '  ' : (/^(\s*)/.exec(base)[1] || '  ');
  lines[index] = base;
  lines.splice(index + 1, 0, `${indent}(${slug})`);
}

// Put `body: <shape>` under a SKILL.md's frontmatter metadata, creating the block
// where the file has none.
export function withBody(source, body) {
  const src = String(source ?? '');
  if (!src.startsWith('---')) return `---\nmetadata:\n  body: ${body}\n---\n${src}`;
  const end = src.indexOf('\n---', 3);
  if (end === -1) return src;
  const lines = src.slice(4, end).split('\n');
  const at = lines.findIndex((l) => /^metadata:\s*$/.test(l));
  if (at === -1) lines.push('metadata:', `  body: ${body}`);
  else lines.splice(at + 1, 0, `  body: ${body}`);
  return `---\n${lines.join('\n')}${src.slice(end)}`;
}

// Bring one pack onto the convention: every skill declares a body, every unmarked
// RULES.md rule gets a proposed marker and its file, every unnamed carrier an empty
// file; a guidelines skill's bullets stay the skill's. Idempotent - a pack already
// marked is left exactly as it is - and it never writes an entry: history is the
// backfill's. Returns the report lines.
export function markPack(packDir, io, { width = 100 } = {}) {
  const report = [];
  const provDir = `${packDir}/${PROVENANCE_DIR}`;
  const ensureFile = (id, why) => {
    const f = `${provDir}/${fileOfId(id)}`;
    if (io.exists(f)) return;
    io.write(f, '');
    report.push(`${f}: created for ${why}`);
  };
  // 1. Skills declare their body first - which bullets are guidelines depends on it.
  for (const s of packCarriers(packDir, io).skills) {
    if (!s.present || s.body) continue;
    io.write(s.file, withBody(io.read(s.file), s.proposed));
    report.push(`${s.file}: body: ${s.proposed} proposed (${s.proposed === 'guidelines' ? 'bold-trigger bullets and no numbered steps' : 'numbered steps, or no bullets'})`);
  }
  const carriers = packCarriers(packDir, io);
  const taken = new Set(provenanceFiles(packDir, io).keys());
  const prose = [...carriers.rules, ...carriers.guidelines];
  for (const r of prose) if (r.slug) taken.add(r.slug);
  // 2. Markers on RULES.md rules, file by file, bottom-up so line numbers hold while
  // lines are inserted. A guidelines skill's bullets are the skill's file's, and stay
  // unmarked until one has a history of its own.
  const byFile = new Map();
  for (const r of carriers.rules) {
    if (r.slug) continue;
    if (!byFile.has(r.file)) byFile.set(r.file, []);
    byFile.get(r.file).push(r);
  }
  for (const [file, unmarked] of byFile) {
    const lines = io.read(file).split('\n');
    for (const r of [...unmarked].sort((a, b) => b.lastLine - a.lastLine)) {
      const slug = proposeSlug(r.trigger, taken);
      taken.add(slug);
      markLine(lines, r.lastLine - 1, slug, width);
      report.push(`${file}:${r.line}: "${r.trigger}" marked (${slug})${r.numeric ? ` - numeric marker (${r.numeric}) replaced` : ''}`);
      ensureFile(slug, `rule "${r.trigger}"`);
    }
    io.write(file, lines.join('\n'));
  }
  // 3. A file for every carrier that names one and has none.
  for (const r of prose) if (r.slug) ensureFile(r.slug, `rule "${r.trigger}"`);
  for (const s of carriers.skills) if (s.present) ensureFile(s.name, `skill ${s.name}`);
  for (const c of carriers.checks) ensureFile(elementIdOf(c.id), `check ${c.id}`);
  for (const d of carriers.declarations) ensureFile(d.id, `declared rule ${d.id}`);
  for (const t of carriers.tasks) ensureFile(t.id, `task ${t.id}`);
  if (carriers.manifest) ensureFile(PACK_ELEMENT, 'the manifest');
  return report;
}

// Parse a references.md: [{ key, kind, target, n, text, line }] - RULES-n, <skill>-n
// and check:<id> entries, each with its full text (continuation lines joined).
export function parseReferencesDoc(text) {
  const out = [];
  let cur = null;
  String(text ?? '').split('\n').forEach((line, i) => {
    const m = /^\s*-\s+\*\*\(([^)]+)\)\*\*\s*(.*)$/.exec(line);
    if (m) {
      cur = { key: m[1].trim(), text: m[2].trim(), line: i + 1 };
      const check = /^check:(.+)$/.exec(cur.key);
      const task = /^task:(.+)$/.exec(cur.key);
      const rule = /^RULES-(\d+[a-z]?)$/.exec(cur.key);
      const skill = /^(.+)-(\d+[a-z]?)$/.exec(cur.key);
      if (check) Object.assign(cur, { kind: 'check', target: check[1] });
      else if (task) Object.assign(cur, { kind: 'task', target: task[1] });
      else if (rule) Object.assign(cur, { kind: 'rule', n: rule[1] });
      else if (skill) Object.assign(cur, { kind: 'skill', target: skill[1], n: skill[2] });
      else cur.kind = 'unknown';
      out.push(cur);
      return;
    }
    if (cur && /^\s+\S/.test(line)) cur.text = `${cur.text} ${line.trim()}`;
    else cur = null;
  });
  return out;
}

// The reaffirmation sentences a references entry ends with, split off as Retire when.
function splitReaffirmation(text) {
  const retire = [];
  const rest = [];
  for (const s of String(text).split(/(?<=[.!?])\s+(?=[A-Z])/)) (/^(Retire|Reaffirm|Revisit)\b/.test(s) ? retire : rest).push(s);
  return { reason: rest.join(' ').trim(), retire: retire.join(' ').trim() };
}

// A references doc sat at the pack root and its text linked relative to it; the entry
// sits one folder down, so every relative link gains the `../` that keeps it resolving.
const LINK = /\]\((?![a-z][a-z0-9+.-]*:|#|\/)([^)\s]+)\)/g;
const relinked = (text) => String(text).replace(LINK, (m, target) => `](../${target})`);

// Convert a pack's references.md into entries on the elements its keys name, rewrite
// each numeric marker to the slug its element takes (a workflow skill's markers leave
// the step), and delete the doc. `dateOf(key)` dates an entry - the entry's adding
// commit where the caller can read git, else the conversion's own date, which the
// entry's title then says. Returns the report lines; a pack with no doc reports
// nothing.
export function convertReferences(packDir, io, { dateOf = () => null, today = new Date().toISOString().slice(0, 10), width = 100 } = {}) {
  const doc = `${packDir}/references.md`;
  if (!io.exists(doc)) return [];
  const report = [];
  const refs = parseReferencesDoc(io.read(doc));
  const provDir = `${packDir}/${PROVENANCE_DIR}`;
  const carriers = packCarriers(packDir, io);
  const taken = new Set(provenanceFiles(packDir, io).keys());
  for (const r of [...carriers.rules, ...carriers.guidelines]) if (r.slug) taken.add(r.slug);
  const skillsByName = new Map(carriers.skills.map((s) => [s.name, s]));
  const rewrites = new Map(); // file → [{ lastLine, slug|null }]
  const planRewrite = (file, lastLine, slug) => { if (!rewrites.has(file)) rewrites.set(file, []); rewrites.get(file).push({ lastLine, slug }); };
  const write = (id, entry) => {
    const f = `${provDir}/${fileOfId(id)}`;
    const existing = io.exists(f) ? io.read(f) : '';
    const kind = parseEntries(existing).entries.length === 0 ? 'born' : 'strengthened';
    const { problems, text } = appendedText(existing, { ...entry, kind });
    if (problems.length) { report.push(`${f}: not written - ${problems.join('; ')}`); return; }
    io.write(f, text);
    report.push(`${f}: ${kind} entry from references.md (${entry.key})`);
  };
  const entryFor = (ref, mechanism) => {
    const { reason, retire } = splitReaffirmation(relinked(ref.text));
    const dated = dateOf(ref.key);
    return {
      key: ref.key, date: dated ?? today,
      title: `converted from references.md (${ref.key})${dated ? '' : ', dated by the conversion'}`,
      fields: { Reason: reason, Mechanism: mechanism, 'Retire when': retire },
    };
  };
  const cites = (blocks, n) => blocks.filter((b) => b.numeric && b.numeric.split(/\s*,\s*/).includes(n));
  const slugFor = (block) => {
    if (block.slug) return block.slug;
    const slug = proposeSlug(block.trigger, taken);
    taken.add(slug);
    block.slug = slug;
    planRewrite(block.file, block.lastLine, slug);
    return slug;
  };
  for (const ref of refs) {
    if (ref.kind === 'rule') {
      const targets = cites(carriers.rules, ref.n);
      if (!targets.length) { report.push(`${doc}:${ref.line}: ${ref.key} cited by no rule - dropped`); continue; }
      for (const b of targets) write(slugFor(b), entryFor(ref, 'prose'));
      continue;
    }
    if (ref.kind === 'skill') {
      const skill = skillsByName.get(ref.target);
      if (!skill) { report.push(`${doc}:${ref.line}: ${ref.key} names no skill - dropped`); continue; }
      const targets = cites(skill.bullets, ref.n);
      if (skill.body === 'guidelines') {
        if (!targets.length) { report.push(`${doc}:${ref.line}: ${ref.key} cited by no guideline - dropped`); continue; }
        for (const b of targets) write(slugFor(b), entryFor(ref, `prose, a guideline of the ${skill.name} skill`));
      } else {
        for (const b of targets) planRewrite(b.file, b.lastLine, null);
        const e = entryFor(ref, `a step of the ${skill.name} skill, a workflow`);
        if (targets.length) e.title = `${e.title}: "${targets[0].trigger}"`;
        write(skill.name, e);
      }
      continue;
    }
    if (ref.kind === 'check') {
      if (!carriers.checks.some((c) => c.id === ref.target)) { report.push(`${doc}:${ref.line}: ${ref.key} names no check the pack carries - dropped`); continue; }
      write(elementIdOf(ref.target), entryFor(ref, 'a check'));
      continue;
    }
    if (ref.kind === 'task') {
      if (!carriers.tasks.some((t) => t.id === ref.target)) { report.push(`${doc}:${ref.line}: ${ref.key} names no task the pack carries - dropped`); continue; }
      write(ref.target, entryFor(ref, 'a task'));
      continue;
    }
    report.push(`${doc}:${ref.line}: ${ref.key} is not a RULES-n, <skill>-n, check:<id> or task:<id> key - dropped`);
  }
  for (const [file, plan] of rewrites) {
    const lines = io.read(file).split('\n');
    const seen = new Set();
    for (const { lastLine, slug } of plan.sort((a, b) => b.lastLine - a.lastLine)) {
      if (seen.has(lastLine)) continue;
      seen.add(lastLine);
      if (slug) markLine(lines, lastLine - 1, slug, width);
      else lines[lastLine - 1] = lines[lastLine - 1].replace(NUMERIC_MARKER_AT_END, '');
    }
    io.write(file, lines.join('\n'));
  }
  if (typeof io.remove === 'function') { io.remove(doc); report.push(`${doc}: converted and deleted`); }
  else report.push(`${doc}: converted; this io cannot delete a file, so the doc stays until a hand removes it`);
  return report;
}

// --- the promotion reduction --------------------------------------------------------

// What crosses a repository boundary is reduced by what that boundary is (DESIGN §4):
// a session id and a quoted phrase never cross; a handle becomes its role and a
// member's repo reference "a member repository" once the canon is public.
export function reduceText(text, { publicCanon = false } = {}) {
  let out = String(text ?? '');
  out = out.replace(/\bsession_[A-Za-z0-9]{8,}\b/g, 'a session');
  out = out.replace(/\b\d{4}-\d{2}-\d{2}T\d{4}Z--(?:pr|issue)-\d+--[A-Za-z0-9-]+(?:\.jsonl)?\b/g, 'a capture');
  out = out.replace(/(?<=^|\s)"[^"\n]{12,}"(?=[\s.,;:)]|$)/g, '(quote dropped)');
  out = out.replace(/(?<=^|\s)“[^”\n]{12,}”(?=[\s.,;:)]|$)/g, '(quote dropped)');
  if (publicCanon) {
    out = out.replace(/@[A-Za-z0-9-]+ \((owner|maintainer|contributor)\)/g, 'the $1');
    out = out.replace(/\b[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+#\d+\b/g, 'a member repository');
  }
  return out;
}

// A whole file reduced: headings keep their kind and date; every field line is
// reduced as text.
export function reduceFile(text, opts) {
  return String(text ?? '').split('\n').map((l) => (l.startsWith('## ') ? l : reduceText(l, opts))).join('\n');
}

// --- io over a checkout --------------------------------------------------------------

// The io over a real checkout: the same capability names the migration registry's
// callers build, plus `remove`, which the conversion needs for the doc it retires.
export function checkoutIo(root) {
  const abs = (p) => join(root, p);
  return {
    exists: (p) => existsSync(abs(p)),
    read: (p) => (existsSync(abs(p)) ? readFileSync(abs(p), 'utf8') : null),
    write: (p, text) => { mkdirSync(dirname(abs(p)), { recursive: true }); writeFileSync(abs(p), text); },
    listDir: (p) => { try { return readdirSync(abs(p)); } catch { return null; } },
    remove: (p) => rmSync(abs(p), { force: true }),
  };
}
