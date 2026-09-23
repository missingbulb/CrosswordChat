#!/usr/bin/env node
// The provenance log's one tool (the provenance design, #2136): every flow that
// creates or changes an element appends through it, the marking pass runs through it,
// and a maintainer checks a pack with it. Two roots - a canon's `packs/<id>` and a
// member's `.claudinite/local/packs/<id>` - resolved from the id, or `--all` for every
// pack under both. The grammar and the codemods are the engine helper's
// (engine/checks/helpers/provenance.mjs); this is the command line over them, and
// the parts that need git or a scrub.
//
//   node <path-to-this-file> mark <pack>|--all [--dry-run]
//   node <path-to-this-file> check <pack>|--all
//   node <path-to-this-file> convert-references <pack>|--all
//   node <path-to-this-file> append <pack> <element> [--kind <kind>] [--date <YYYY-MM-DD>] [--changed] < entry.md
//   node <path-to-this-file> reduce <file> [--public]
//   node <path-to-this-file> history <pack> <element>
//   node <path-to-this-file> brief <pack> [<element>…]
//   node <path-to-this-file> apply <pack> <brief.md> [--backfill]
//
// In a member the path is .claudinite/shared/packs/claudinite-growth/provenance.mjs; in
// the canon, packs/claudinite-growth/provenance.mjs. The append reads one entry in the
// file grammar from stdin - `## <date> · <kind> · <title>` and its `- **Field:** …`
// lines - and refuses one that carries a secret, since a decision log is prose an
// agent writes and the one place nothing else scans.
//
// A provenance file is append-only for every flow but one: a change recorded now cannot
// have happened before the change recorded last. The backfill is the exception by design,
// because it derives a history that already happened - `--backfill` on `append` and
// `apply` writes entries dated in the past, in date order over the whole file, and is the
// only lane that does.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
// A namespace import, guarded in `main`: the pack and engine lanes deliver on separate
// cadences, and a mount whose engine predates the helper must say so rather than fault
// on a missing named export.
import * as provenance from '../../engine/checks/helpers/provenance.mjs';
import * as conventions from '../../engine/pack_loader/pack-conventions.mjs';
import { scrub } from './capture-log.mjs';

// The version log's name, with the same lane-skew fallback as the helper import above.
const VERSIONS_FILE = conventions.VERSIONS_FILE ?? 'VERSIONS.md';

const {
  checkoutIo, auditPack, markPack, convertReferences, appendedText, backfilledText, parseEntryText, packCarriers,
  provenanceFiles, reduceFile, fileOfId, elementIdOf, ruleBlocks, skillShape, parseEntries, renderEntry,
  PACK_ROOTS, PROVENANCE_DIR, DECLINED_FILE, DECLINED_KIND, PACK_ELEMENT,
} = provenance;

const USAGE = `usage: provenance.mjs <command> …
  mark <pack>|--all [--dry-run]          markers, bodies and empty files for every carrier
  check <pack>|--all                     what each file is named by, and every fault
  convert-references <pack>|--all        the references.md of a pack into its elements' files
  append <pack> <element> [--kind K] [--date D] [--changed] [--backfill] < entry.md
  reduce <file> [--public]               the promotion reduction, to stdout
  history <pack> <element>               one element's raw evidence from git, VERSIONS.md and the README
  brief <pack> [<element>…]              the backfill brief: every pull request once, a draft entry per event
  apply <pack> <brief.md> [--backfill]   append every drafted entry of an edited brief, each once
  --backfill                             the backfill's lane: entries dated in the past, written in
                                         date order over the file, creating one the marking pass
                                         could not. every other caller appends, and only at the end`;

// --- packs and roots ---------------------------------------------------------------

export function resolvePack(root, id, io = checkoutIo(root)) {
  if (id.includes('/')) return io.exists(`${id}/pack.mjs`) ? id.replace(/\/+$/, '') : null;
  for (const r of PACK_ROOTS) if (io.exists(`${r}/${id}/pack.mjs`)) return `${r}/${id}`;
  return null;
}

export function allPacks(io) {
  const out = [];
  for (const r of PACK_ROOTS) for (const name of (io.listDir(r) ?? []).sort()) if (io.exists(`${r}/${name}/pack.mjs`)) out.push(`${r}/${name}`);
  return out;
}

// A copy-on-write io over another: what `--dry-run` runs the codemods against, so the
// report is the real one and the tree is untouched.
export function overlayIo(base) {
  const written = new Map();
  const removed = new Set();
  const listDir = (p) => {
    if (written.has(p)) return null;
    const names = new Set((removed.has(p) ? null : base.listDir(p)) ?? []);
    let any = names.size > 0 || base.listDir(p) !== null;
    for (const w of written.keys()) {
      if (w.startsWith(`${p}/`)) { names.add(w.slice(p.length + 1).split('/')[0]); any = true; }
    }
    for (const r of removed) names.delete(r.slice(p.length + 1));
    return any ? [...names] : null;
  };
  return {
    exists: (p) => (removed.has(p) ? false : written.has(p) || base.exists(p)),
    read: (p) => (removed.has(p) ? null : written.has(p) ? written.get(p) : base.read(p)),
    write: (p, t) => { written.set(p, t); removed.delete(p); },
    remove: (p) => { removed.add(p); written.delete(p); },
    listDir,
  };
}

const git = (root, ...args) => { try { return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); } catch { return ''; } };

// --- the commands ------------------------------------------------------------------

export function mark(root, packs, { dryRun = false } = {}) {
  const real = checkoutIo(root);
  const io = dryRun ? overlayIo(real) : real;
  const lines = [];
  let empty = 0;
  for (const pack of packs) {
    lines.push(...markPack(pack, io));
    empty += auditPack(pack, io).empty.length;
  }
  lines.push(`${empty} empty provenance file${empty === 1 ? '' : 's'} under ${packs.length === 1 ? packs[0] : `${packs.length} packs`}${dryRun ? ' (dry run: nothing written)' : ''}`);
  return { lines, empty };
}

// The audit as text: what each file is named by, then every fault. Exit status is the
// caller's: faults are anything but pending history.
export function check(root, packs) {
  const io = checkoutIo(root);
  const lines = [];
  let faults = 0;
  for (const pack of packs) {
    const a = auditPack(pack, io);
    const namedBy = new Map();
    const name = (id, by) => { if (!namedBy.has(id)) namedBy.set(id, []); namedBy.get(id).push(by); };
    for (const r of a.carriers.rules) if (r.slug) name(r.slug, `rule "${r.trigger}"`);
    for (const g of a.carriers.guidelines) if (g.slug) name(g.slug, `guideline "${g.trigger}" (${g.skill})`);
    for (const s of a.carriers.skills) if (s.present) name(s.name, `skill ${s.name} (${s.body ?? 'no body'})`);
    for (const c of a.carriers.checks) name(elementIdOf(c.id), `check ${c.id}`);
    for (const t of a.carriers.tasks) name(t.id, `task ${t.id}`);
    for (const d of a.carriers.declarations) name(d.id, `declared rule ${d.id}`);
    if (a.carriers.manifest) name(PACK_ELEMENT, 'the manifest');
    lines.push(`${pack}/${PROVENANCE_DIR}/`);
    const state = (f) => (f.status === 'retired' ? ' (retired)' : f.empty ? ' (empty)' : f.convertedOnly ? ' (conversion only, history pending)' : '');
    for (const [id, f] of [...a.files].sort()) lines.push(`  ${fileOfId(id)} ← ${(namedBy.get(id) ?? ['nothing']).join(', ')}${state(f)}`);
    // The declined log is named by no carrier, so it is listed rather than matched: a pass
    // that turned candidates down cannot be read off a listing that leaves it out.
    if (a.declined) lines.push(`  ${DECLINED_FILE} ← ${a.declined.entries.length} candidate${a.declined.entries.length === 1 ? '' : 's'} turned down`);
    const fault = (file, line, what) => { faults++; lines.push(`  ${file}${line ? `:${line}` : ''}: ${what}`); };
    for (const u of a.unmarked) fault(u.file, u.line, `"${u.trigger}" ends with no marker`);
    for (const d of a.dangling) fault(d.file, d.line, `${d.carrier} names ${fileOfId(d.id)}, which is ${d.retired ? 'retired' : 'no file'}`);
    for (const u of a.unnamed) fault(u.file, null, 'live, and named by no carrier');
    for (const n of a.noBody) fault(n.file, null, `skill ${n.skill} declares no body`);
    for (const m of a.markerInWorkflow) fault(m.file, m.line, `"${m.trigger}" carries a marker inside a workflow skill`);
    for (const e of a.parseErrors) fault(e.file, e.line, e.what);
    for (const e of a.entryFaults) fault(e.file, e.line, e.what);
    if (a.referencesDoc) fault(a.referencesDoc, null, 'a references.md still exists - convert-references retires it');
  }
  return { lines, faults };
}

// The earliest commit that added a references key, as a YYYY-MM-DD date - what dates
// a converted entry where git is there to read.
export function referenceDateOf(root, doc) {
  return (key) => {
    const out = git(root, 'log', '--reverse', '--format=%as', `-S**(${key})**`, '--', doc).trim().split('\n')[0];
    return /^\d{4}-\d{2}-\d{2}$/.test(out ?? '') ? out : null;
  };
}

export function convert(root, packs) {
  const io = checkoutIo(root);
  const lines = [];
  for (const pack of packs) lines.push(...convertReferences(pack, io, { dateOf: referenceDateOf(root, `${pack}/references.md`) }));
  return lines;
}

// The elements the working tree's change touched, for `append --changed`: a rule whose
// normalized text differs from HEAD's, a check module, a task or the manifest that
// changed, a skill whose file changed (its guidelines by text).
export function changedElements(root, pack) {
  const io = checkoutIo(root);
  const changed = new Set([...git(root, 'diff', '--name-only', 'HEAD', '--', pack).split('\n'), ...git(root, 'ls-files', '--others', '--exclude-standard', '--', pack).split('\n')].filter(Boolean));
  const head = { ...io, read: (p) => { const t = git(root, 'show', `HEAD:${p}`); return t === '' && !git(root, 'cat-file', '-e', `HEAD:${p}`) ? null : t; } };
  const out = new Set();
  const now = packCarriers(pack, io);
  const before = packCarriers(pack, head);
  const byTrigger = (list) => new Map(list.map((r) => [r.trigger, r]));
  const prose = (nowList, thenList) => {
    const then = byTrigger(thenList);
    for (const r of nowList) {
      if (!r.slug || !changed.has(r.file)) continue;
      const was = then.get(r.trigger);
      if (!was || was.text !== r.text) out.add(r.slug);
    }
  };
  prose(now.rules, before.rules);
  prose(now.guidelines, before.guidelines);
  for (const s of now.skills) if (s.present && changed.has(s.file)) out.add(s.name);
  for (const c of now.checks) if (changed.has(c.file)) out.add(elementIdOf(c.id));
  for (const t of now.tasks) if ([...changed].some((f) => f.startsWith(`${t.dir}/`))) out.add(t.id);
  if (now.manifest && changed.has(`${pack}/pack.mjs`)) out.add(PACK_ELEMENT);
  return [...out].sort();
}

export function append(root, pack, elements, entryText, { kind = null, date = null, backfill = false } = {}) {
  const io = checkoutIo(root);
  const scrubbed = scrub(entryText);
  if (scrubbed !== entryText) return { problems: ['the entry carries what reads as a secret; a decision log is the one place nothing else scans, so it is refused whole'] };
  const parsed = parseEntryText(entryText);
  if (parsed.problems.length) return { problems: parsed.problems };
  const entry = { ...parsed.entry, ...(kind ? { kind } : {}), ...(date ? { date } : {}) };
  const written = [];
  for (const element of elements) {
    const declined = element === DECLINED_KIND || element === '_declined';
    const file = `${pack}/${PROVENANCE_DIR}/${declined ? DECLINED_FILE : fileOfId(element)}`;
    // The backfill opens a file the marking pass could not: an element retired before that
    // pass is named by no carrier, so nothing will ever create its file for it (#2222).
    if (!declined && !io.exists(file) && !(backfill && entry.kind === 'born')) {
      return { problems: [`${file} does not exist - no carrier of ${pack} names an element "${element}" (run mark, or check the id${backfill ? '; a --backfill batch opens a new file with born' : ''})`] };
    }
    const existing = io.read(file) ?? '';
    const result = backfill && !declined
      ? (() => { const r = backfilledText(existing, [entry], {}); return r.problems.length ? r : { problems: [], text: r.text }; })()
      : appendedText(existing, entry, declined ? { kinds: [DECLINED_KIND], firstKind: null } : {});
    if (result.problems.length) return { problems: result.problems.map((p) => `${file}: ${p}`) };
    io.write(file, result.text);
    written.push(file);
  }
  return { problems: [], written };
}

// The backfill brief: the carrier's commits through every rename, a pickaxe on the
// rule's lead-in, the pull requests those commits name, the VERSIONS.md rows naming
// them, and the README's history sentences. Tracker comments live on GitHub and are
// the session's to read.
export function history(root, pack, element) {
  const io = checkoutIo(root);
  const c = packCarriers(pack, io);
  const files = new Set();
  const triggers = [];
  for (const r of [...c.rules, ...c.guidelines]) if (r.slug === element) { files.add(r.file); triggers.push(r.trigger); }
  for (const s of c.skills) if (s.name === element) files.add(s.file);
  for (const x of c.checks) if (elementIdOf(x.id) === element) files.add(x.file);
  for (const t of c.tasks) if (t.id === element) files.add(t.dir);
  if (element === PACK_ELEMENT) files.add(`${pack}/pack.mjs`);
  const lines = [`# ${pack} · ${element}`];
  if (!files.size) { lines.push('named by no carrier of this pack'); return lines; }
  const prs = new Set();
  const note = (commits) => { for (const m of commits.matchAll(/\(#(\d+)\)/g)) prs.add(m[1]); };
  for (const f of files) {
    lines.push(`\n## commits touching ${f}`);
    const log = git(root, 'log', '--follow', '--format=%h %as %s', '--', f);
    lines.push(log.trim() || '(none - is the clone shallow?)');
    note(log);
  }
  for (const t of triggers) {
    lines.push(`\n## commits adding or removing "${t}"`);
    const log = git(root, 'log', '--format=%h %as %s', `-S${t}`, '--', pack);
    lines.push(log.trim() || '(none)');
    note(log);
  }
  lines.push('\n## pull requests those commits name');
  lines.push(prs.size ? [...prs].sort((a, b) => a - b).map((n) => `#${n}`).join(' ') : '(none)');
  const versions = io.read(`${pack}/${PROVENANCE_DIR}/${VERSIONS_FILE}`);
  if (versions) {
    lines.push('\n## VERSIONS.md rows naming them');
    const rows = versions.split('\n').filter((l) => l.startsWith('|') && [...prs].some((n) => l.includes(`#${n}`)));
    lines.push(rows.join('\n') || '(none)');
  }
  const readme = io.read(`${pack}/README.md`);
  if (readme) {
    lines.push('\n## README sentences that read as history');
    const tells = readme.split(/(?<=[.!?])\s+/).filter((s) => /#\d+|\buntil\b|\bdistilled from\b|\bkept as\b|\breplaced\b|\babsorbed\b|\b20\d\d-\d\d-\d\d\b/.test(s) || triggers.some((t) => s.includes(t)));
    lines.push(tells.map((s) => `- ${s.replace(/\s+/g, ' ').trim()}`).join('\n') || '(none)');
  }
  lines.push('\n## tracker comments');
  lines.push('read the promote tracker and the extract issues on GitHub; git does not hold them');
  return lines;
}

// --- the backfill brief and its apply -----------------------------------------------
//
// A pack's history is a sequence of pull requests, each bearing or changing several
// elements, so the brief is written pull request first: the squash commit's body once
// (a merge here carries the whole review conversation's conclusion in it), then one
// draft entry per element and event with every field git can vouch for - the date, the
// kind, the actor by handle, the model from the trailer, the carrier as Mechanism, and
// Landed with the version VERSIONS.md cut for it. What git cannot vouch for - Source,
// Reason, Rejected, Retire when - is left out, never filled: the draft is a fact the
// session extends with the decision, or deletes where the commit was not one.
//
// An element's events are read from the carrier's own history rather than a pickaxe: a
// rule is walked back through every commit of its file - by slug, then by trigger, then
// by text - and is born where it first appears and reworded where its normalized text
// changed; a skill, a check, a task and the manifest are born at the oldest commit of
// their file and every later commit is a candidate the session judges. A commit that
// touched many packs is a sweep - a re-wrap, a rename, a marking pass - and is listed
// once, never drafted onto an element: the precedent records a sweep on `_pack.md`, and
// only where it changed the pack's shape.

const SWEEP_PACKS = 5;
const TRAILER = /^(?:co-authored-by|claude-session|signed-off-by|reviewed-by|refs|fixes|closes|resolves):?\s/i;
const MODEL_TRAILER = /^co-authored-by:\s*(Claude\b[^<]*?)\s*</i;
const REFERENCED = /\b(Refs|Fixes|Closes|Resolves)\s*:?\s*#(\d+)/gi;
const PR_AT_END = /\s*\(#(\d+)\)\s*$/;
const ENTRY_FENCE = /^```entry (\S+)\s*$/;
const BODY_LINES = 60;

// One commit, read once: what the squash merge carried, and how many packs it touched.
function commitInfo(root, sha, cache) {
  if (cache.has(sha)) return cache.get(sha);
  const [full, short, date, email, parents, subject, body = ''] = git(root, 'show', '-s', '--format=%H%x00%h%x00%as%x00%ae%x00%P%x00%s%x00%b', sha).split('\0');
  const models = new Set();
  const lines = [];
  for (const l of (body ?? '').split('\n')) {
    const m = MODEL_TRAILER.exec(l.trim());
    if (m) { models.add(m[1].trim()); continue; }
    if (TRAILER.test(l.trim())) continue;
    lines.push(l.trimEnd());
  }
  const pr = PR_AT_END.exec(subject ?? '')?.[1] ?? null;
  // The keyword each reference was written with, kept rather than flattened: a body
  // saying `Fixes #956` and one saying `Refs #956` are different claims, and the entry
  // that reports either as the other sends a reader to the wrong kind of link. What the
  // PULL REQUEST body said can differ again, and git cannot see it - `brief` hands that
  // over rather than guessing (#2221).
  const refs = [];
  for (const [, keyword, n] of (body ?? '').matchAll(REFERENCED)) {
    if (n === pr || refs.some((r) => r.n === n)) continue;
    refs.push({ n, keyword: `${keyword[0].toUpperCase()}${keyword.slice(1).toLowerCase()}` });
  }
  // A merge commit's own trailer is GitHub's, naming the generic "Claude" where every
  // commit on the branch names the model that did the work. Reading the branch side back
  // keeps a known attribution from laundering into an unknown one (#2221).
  const branch = (parents ?? '').trim().split(/\s+/).filter(Boolean);
  if (branch.length > 1 && (!models.size || (models.size === 1 && models.has('Claude')))) {
    for (const l of git(root, 'log', '--format=%b', `${branch[0]}..${sha}`).split('\n')) {
      const m = MODEL_TRAILER.exec(l.trim());
      if (m) models.add(m[1].trim());
    }
  }
  const packs = new Set();
  const files = [];
  for (const f of git(root, 'diff-tree', '--root', '-r', '-m', '--first-parent', '--no-commit-id', '--name-only', sha).split('\n')) {
    if (f) files.push(f);
    const m = /^(?:\.claudinite\/local\/)?packs\/([^/]+)\//.exec(f);
    if (m) packs.add(m[1]);
  }
  // GitHub's own squash line names a bare "Claude" beside the session's trailer.
  if (models.size > 1) models.delete('Claude');
  const info = {
    sha: full, short, date, subject, pr, refs, models: [...models], files,
    title: (subject ?? '').replace(PR_AT_END, '').trim(),
    handle: /^\d+\+([^@]+)@users\.noreply\.github\.com$/.exec(email ?? '')?.[1] ?? null,
    body: lines.join('\n').replace(/\n{3,}/g, '\n\n').trim(),
    sweep: packs.size >= SWEEP_PACKS,
  };
  cache.set(sha, info);
  return info;
}

const repoOwner = (root) => /github\.com[:/]([^/]+)\//.exec(git(root, 'remote', 'get-url', 'origin'))?.[1] ?? null;

// The commits touching a path, newest first, each with the path it had then.
function commitsOf(root, path, { follow = true } = {}) {
  const out = [];
  let sha = null;
  for (const line of git(root, 'log', ...(follow ? ['--follow'] : []), '--format=%x01%H', '--name-only', '--', path).split('\n')) {
    if (line.startsWith('\x01')) { sha = line.slice(1); out.push({ sha, path }); continue; }
    if (line.trim() && sha) out[out.length - 1].path = line.trim();
  }
  return out;
}

// A rule's events, walked back through its file: born where it is first found,
// reworded at each commit after which its text differs.
function ruleEvents(root, file, rule, blocksOf) {
  let state = rule;
  let newer = null;
  const events = [];
  for (const { sha, path } of commitsOf(root, file)) {
    const text = git(root, 'show', `${sha}:${path}`);
    const blocks = text ? blocksOf(text) : [];
    const found = (state.slug && blocks.find((b) => b.slug === state.slug))
      || blocks.find((b) => b.trigger === state.trigger)
      || blocks.find((b) => b.text === state.text);
    if (!found) break;
    if (newer && found.text !== state.text) events.push({ kind: 'reworded', sha: newer });
    state = found;
    newer = sha;
  }
  if (newer) events.push({ kind: 'born', sha: newer });
  return events;
}

// One check's own declaration in a file it shares with its siblings, as JSON text.
const declarationOf = (text, id) => {
  try { return (JSON.parse(text) ?? []).find((x) => x?.id === id) ?? null; } catch { return null; }
};

// A check declared in a file shared with every other check of its pack: its events are
// the commits after which ITS OWN declaration differs. Read as a file, a `declared-checks.json`
// drafts `reworded` for every id in it at every touch - including ids the commit does not
// change, and ids that did not yet exist at that commit (#2221).
function declaredCheckEvents(root, path, id) {
  const events = [];
  let state = null;
  let newer = null;
  for (const { sha, path: p } of commitsOf(root, path)) {
    const found = declarationOf(git(root, 'show', `${sha}:${p}`), id);
    if (!found) break;
    const text = JSON.stringify(found);
    if (newer && text !== state) events.push({ kind: 'reworded', sha: newer });
    state = text;
    newer = sha;
  }
  return newer ? [...events, { kind: 'born', sha: newer }] : [];
}

// A file-borne element's events: born at the oldest commit of its path, every later
// commit a reworded candidate - except one that changed nothing but a version line,
// which is the bump no entry is owed for.
function fileEvents(root, path, { follow = true } = {}) {
  const commits = commitsOf(root, path, { follow });
  if (!commits.length) return [];
  const bump = (c) => {
    const changed = git(root, 'show', '--format=', c.sha, '--', c.path).split('\n').filter((l) => /^[-+](?![-+])/.test(l));
    return changed.length > 0 && changed.every((l) => /^[-+]\s*version:\s*['"]?[\d.]+['"]?,?\s*$/.test(l));
  };
  return [...commits.slice(0, -1).filter((c) => !bump(c)).map((c) => ({ kind: 'reworded', sha: c.sha })), { kind: 'born', sha: commits[commits.length - 1].sha }];
}

// The version a commit landed in: the VERSIONS.md row naming its pull request, the row
// its own diff added, else the version its own diff cut. There is deliberately no
// "first cut after it" limb - it answered the same version for every commit in a long
// gap between bumps, which read as evidence and was not, and put a version on entries
// predating the pack entirely (#2221).
function versionRows(io, pack) {
  return (io.read(`${pack}/${PROVENANCE_DIR}/${VERSIONS_FILE}`) ?? '').split('\n')
    .map((l) => /^\|\s*([^|]+?)\s*\|\s*(\d{4}-\d{2}-\d{2})\s*\|\s*(.*?)\s*\|\s*$/.exec(l))
    .filter(Boolean)
    .map(([, version, date, what]) => ({ version, date, what }));
}
function versionReader(root, pack) {
  const at = new Map();
  const versionAt = (sha) => {
    if (!at.has(sha)) at.set(sha, /\bversion:\s*['"]?([\d.]+)/.exec(git(root, 'show', `${sha}:${pack}/pack.mjs`))?.[1] ?? null);
    return at.get(sha);
  };
  return (info) => {
    const own = versionAt(info.sha);
    return own && own !== versionAt(`${info.sha}^`) ? own : null;
  };
}
// Every path the pack has lived at, its current one first. The commit inventory is scoped
// to the pack's directory, so a pack that MOVED - one promoted out of a member's local packs,
// one renamed on the shelf, a skill that began at the repo root - has its first weeks absent
// from the brief rather than misattributed, which is the harder absence to notice (#2221).
// The anchors are the files a pack cannot exist without; `--follow` walks each back through
// its renames and hands back the path it had at each commit.
export function packPaths(root, pack, io) {
  const out = [pack];
  const c = packCarriers(pack, io);
  const anchors = [`${pack}/pack.mjs`, `${pack}/RULES.md`, `${pack}/README.md`,
    ...c.skills.filter((s) => s.present).map((s) => s.file), ...c.tasks.map((t) => t.file)];
  for (const anchor of anchors) {
    if (!io.exists(anchor)) continue;
    const suffix = anchor.slice(pack.length + 1);
    for (const { path } of commitsOf(root, anchor)) {
      if (path === anchor) continue;
      // The pack root the old path implies, or - where the element lived outside any pack,
      // so no prefix is left over - the directory it sat in.
      const at = (path.endsWith(`/${suffix}`) ? path.slice(0, -(suffix.length + 1)) : '') || path.replace(/\/[^/]+$/, '');
      if (!at || at === pack || out.includes(at)) continue;
      // A root of the pack tree itself would widen the inventory to every pack there.
      if (PACK_ROOTS.includes(at) || at.split('/').length < 2) continue;
      out.push(at);
    }
  }
  return out;
}

// The text a needle is matched against. A trigger is read off the carrier with its markup
// already dropped, so the same rule spelled `LSMinimumSystemVersion` at the path it came
// from matches nothing until both sides are stripped, and a bullet wrapped at 100 columns
// matches nothing until the newline is a space (#2253).
const searchable = (text) => text.replace(/[`*]/g, '').replace(/\s+/g, ' ');
// A table row names every element the table covers by construction - a README rule index, a
// version log, a check catalog - so the element's text appearing in one is evidence it was
// LISTED, never that it was carried there. The two texts are searched separately: the rows
// answer a different question from the file they sit in.
const withoutRows = (text) => text.split('\n').filter((l) => !l.trimStart().startsWith('|')).join('\n');
// A file that could hold a carrier's text: the kinds a carrier is written in, minus a test
// and minus the provenance log itself, which is a record ABOUT the element.
const couldCarry = (path) => /\.(md|mjs|json)$/.test(path) && !path.endsWith('.test.mjs') && !path.includes(`/${PROVENANCE_DIR}/`);

// Several blobs' contents in one call. `--batch` answers `<sha> blob <size>` and then the
// bytes, so the sizes rather than the newlines are what delimit them.
function readBlobs(root, shas) {
  const out = new Map();
  if (!shas.length) return out;
  let buf;
  try {
    buf = execFileSync('git', ['cat-file', '--batch'], { cwd: root, input: `${shas.join('\n')}\n`, maxBuffer: 1 << 30, stdio: ['pipe', 'pipe', 'ignore'] });
  } catch { return out; }
  let at = 0;
  while (at < buf.length) {
    const nl = buf.indexOf(0x0a, at);
    if (nl < 0) break;
    const [sha, type, size] = buf.toString('utf8', at, nl).split(' ');
    if (type !== 'blob') break;
    const start = nl + 1;
    out.set(sha, buf.toString('utf8', start, start + Number(size)));
    at = start + Number(size) + 1;
  }
  return out;
}

// Every revision of every file the pack's carriers could live in, oldest commit first, each
// as the two texts a needle is searched against. Read whole rather than by pickaxe: `-S`
// matches the literal needle in a diff, which a wrap or a backtick at the old path defeats
// silently, and its hits include the index rows that name every element anyway (#2253).
function carrierIndex(root, paths) {
  const revs = [];
  const wanted = new Set();
  for (const rec of git(root, 'log', '--reverse', '--format=%x01%H %as', '--raw', '--no-abbrev', '--no-renames', '--', ...paths).split('\x01')) {
    const lines = rec.split('\n');
    const [sha, date] = lines[0].split(' ');
    if (!sha) continue;
    const files = [];
    const lost = [];
    for (const line of lines.slice(1)) {
      const m = /^:\d+ \d+ ([0-9a-f]+) ([0-9a-f]+) \w+\t(.+)$/.exec(line);
      if (!m || !couldCarry(m[3])) continue;
      // A carrier that lost text here, deleted or shortened, is the other half of a move -
      // the only structural evidence left when the element was reworded on its way across.
      if (!/^0+$/.test(m[1])) { lost.push([m[3], m[1]]); wanted.add(m[1]); }
      if (/^0+$/.test(m[2])) continue;
      files.push([m[3], m[2]]);
      wanted.add(m[2]);
    }
    if (files.length || lost.length) revs.push({ sha, date, files, lost });
  }
  const texts = readBlobs(root, [...wanted]);
  const carried = new Map();
  const listed = new Map();
  const size = new Map();
  for (const [sha, text] of texts) { carried.set(sha, searchable(withoutRows(text))); listed.set(sha, searchable(text)); size.set(sha, text.length); }
  return { revs, carried, listed, size };
}

// The element's life before its current carrier. `born` is drafted at the oldest commit of
// the carrier it sits in TODAY, which is the moment of the LAST CARRIER CHANGE wherever a
// rule moved into a skill, a coded check became a declaration, or a rule was a prose section
// before it was a bullet. The search finds the earlier carrier by the element's own
// distinctive text across every path the pack has lived at; the birth moves there, and the
// commit that had been drafting `born` becomes the carrier change it really was (#2221).
// Where no carrier holds the text earlier, the answer is not a birth but a failed search,
// and a listing that DOES hold it is what says which (#2253).
function followCarrier(index, el, bornSha, position) {
  if (!el.needle || !position.has(bornSha)) return null;
  const want = searchable(el.needle);
  let listedAt = null;
  for (const rev of index.revs) {
    // Ordered by where the commits sit in the history rather than by their dates: a carrier
    // change and the commit it moved from can land on one day, and two dates that tie say
    // nothing about which came first.
    if (!position.has(rev.sha) || position.get(rev.sha) >= position.get(bornSha)) continue;
    const files = rev.files.filter(([, blob]) => index.carried.get(blob)?.includes(want)).map(([path]) => path);
    if (files.length) return { sha: rev.sha, date: rev.date, files };
    if (listedAt) continue;
    const row = rev.files.find(([, blob]) => index.listed.get(blob)?.includes(want));
    if (row) listedAt = { sha: rev.sha, date: rev.date, file: row[0] };
  }
  return { listedAt, shrank: shrankAt(index, bornSha, el.carrier) };
}

// A carrier other than this element's that the commit deleted or shortened. A move leaves
// this trace at the old path whatever it did to the text on the way, so it is what says an
// unfollowable birth is worth doubting rather than an element simply starting here.
function shrankAt(index, sha, except) {
  const rev = index.revs.find((r) => r.sha === sha);
  if (!rev) return null;
  for (const [path, pre] of rev.lost) {
    if (path === except) continue;
    const post = rev.files.find(([p]) => p === path)?.[1];
    if (!post) return path;
    if ((index.size.get(post) ?? 0) < (index.size.get(pre) ?? 0)) return path;
  }
  return null;
}

// Every commit's place in the history, oldest first.
const positionsOf = (root) => new Map(git(root, 'rev-list', '--reverse', '--topo-order', 'HEAD').split('\n').filter(Boolean).map((sha, i) => [sha, i]));

// Which carrier change the old commit records: a move where the element stayed the same
// kind of file, a conversion where it changed kind - a coded module becoming a declaration,
// prose becoming code.
const extensionOf = (f) => /\.(mjs|json|md)$/.exec(f ?? '')?.[1] ?? '';
function carrierChange(fromFiles, toFile) {
  const from = fromFiles.map(extensionOf).filter(Boolean);
  return from.length && !from.includes(extensionOf(toFile)) ? 'converted' : 'moved';
}

// Every commit that touched the pack at all, oldest first. The drafted events are a subset:
// a commit can decide something the carrier text does not show - a manifest field, a rule's
// rationale moving to the README - and a brief that listed only what it drafted would hand
// the session a history it has to re-derive from git before it can trust the drafts.
function packCommits(root, paths, cache) {
  const shas = git(root, 'log', '--format=%H', '--reverse', '--', ...paths).split('\n').filter(Boolean);
  return shas.map((sha) => commitInfo(root, sha, cache));
}
// Relative to the pack's current path, and in full under any path it has since left, so a
// row from before a move reads as one.
const filesUnder = (info, paths) => info.files
  .filter((f) => paths.some((p) => f.startsWith(`${p}/`)))
  .map((f) => (f.startsWith(`${paths[0]}/`) ? f.slice(paths[0].length + 1) : f));

// A version row's own text is the decision the version was cut for, and it names the pull
// request that made it - not always the one the commit subject carries, so the commit's own
// Refs count as a claim too. Never the date: several commits land on one day and a row
// attached to the wrong one reads as evidence, which is worse than the row going unclaimed.
const names = (what, n) => what.includes(`#${n}`) && !new RegExp(`#${n}\\d`).test(what);
// A row whose text names no pull request at all: the deciding commit wrote the row and
// bumped the manifest together and had no reason to cite itself, so the row's own diff is
// the only thing that can claim it. A row that DOES name one belongs to that pull request
// however it arrived - the weekly history task writes rows late, and a bookkeeping commit
// adding a row about #88 has not thereby accounted for #88 (#2221).
const citesNothing = (row) => !/#\d+/.test(row.what);
function rowFor(rows, introducers, info) {
  return rows.find((r) => [info.pr, ...info.refs.map((x) => x.n)].some((n) => n && names(r.what, n)))
    ?? rows.find((r) => citesNothing(r) && introducers.get(r.version) === info.sha)
    ?? null;
}

// The commit that added each row, by pickaxe on the row's own version cell.
function rowIntroducers(root, pack, rows) {
  const file = `${pack}/${PROVENANCE_DIR}/${VERSIONS_FILE}`;
  const out = new Map();
  for (const r of rows) {
    const sha = git(root, 'log', '--reverse', '--format=%H', `-S| ${r.version} |`, '--', file).trim().split('\n')[0];
    if (sha) out.set(r.version, sha);
  }
  return out;
}

function versionFor(rows, introducers, info, ownCut) {
  const byPr = info.pr && rows.find((r) => names(r.what, info.pr));
  if (byPr) return byPr.version;
  const introduced = rows.find((r) => citesNothing(r) && introducers.get(r.version) === info.sha);
  return introduced ? introduced.version : ownCut(info);
}

// Every element the brief covers, with its carrier and its events.
// The born event moved back to the carrier before this one, where the pickaxe finds one,
// and the commit that had been drafting `born` re-read as the move or conversion it is.
function withEarlierCarrier(index, position, el) {
  const born = el.events.find((e) => e.kind === 'born');
  if (!born || !el.needle) return el;
  const at = followCarrier(index, el, born.sha, position);
  // No carrier held the text earlier. That is an ordinary birth for most elements, so only
  // the two shapes carrying evidence against it are named: something listed the element
  // before its carrier held it, or the birth commit took text out of another carrier.
  if (!at || !at.files) {
    if (at?.listedAt || at?.shrank) el.unfollowed = { listedAt: at.listedAt, shrank: at.shrank };
    return el;
  }
  const kind = carrierChange(at.files, el.carrier);
  el.events = [...el.events.map((e) => (e === born ? { kind, sha: born.sha, from: at.files } : e)), { kind: 'born', sha: at.sha }];
  el.followed = { ...at, kind };
  return el;
}

function packElements(root, pack, io, wanted, { paths = [pack], position = positionsOf(root) } = {}) {
  const c = packCarriers(pack, io);
  const files = provenanceFiles(pack, io);
  const ids = wanted.length ? wanted : [...files].filter(([, f]) => f.empty || f.convertedOnly).map(([id]) => id);
  const out = [];
  let index = null;
  const follow = (el) => { if (el.needle) index ??= carrierIndex(root, paths); return out.push(withEarlierCarrier(index, position, el)); };
  for (const id of ids) {
    const rule = c.rules.find((r) => r.slug === id);
    const guideline = c.guidelines.find((r) => r.slug === id);
    const skill = c.skills.find((s) => s.name === id && s.present);
    const check = c.checks.find((x) => elementIdOf(x.id) === id);
    const task = c.tasks.find((t) => t.id === id);
    if (rule) follow({ id, mechanism: `a RULES.md rule, triggered on "${rule.trigger}".`, carrier: rule.file, needle: rule.trigger, events: ruleEvents(root, rule.file, rule, (t) => ruleBlocks(t)) });
    else if (guideline) follow({ id, mechanism: `a guideline of the ${guideline.skill} skill, triggered on "${guideline.trigger}".`, carrier: guideline.file, needle: guideline.trigger, events: ruleEvents(root, guideline.file, guideline, (t) => skillShape(t).bullets) });
    else if (skill) follow({ id, mechanism: `the ${id} skill, body ${skill.body ?? skill.proposed}, reached by its description.`, carrier: skill.file, needle: null, events: fileEvents(root, skill.file) });
    else if (check) follow({ id, mechanism: `check ${check.id}, in ${check.file}.`, carrier: check.file, needle: check.id, check: check.id,
      events: check.file.endsWith('declared-checks.json') ? declaredCheckEvents(root, check.file, check.id) : fileEvents(root, check.file) });
    else if (task) follow({ id, mechanism: `task ${id}.`, carrier: task.file, needle: null, events: fileEvents(root, task.dir, { follow: false }) });
    else if (id === PACK_ELEMENT) {
      // `_pack` records decisions about the pack's shape - what its header comment
      // carries - never every commit in its scope, so only its birth is drafted and
      // the manifest's later commits are listed for the session to judge.
      const events = fileEvents(root, `${pack}/pack.mjs`);
      out.push({ id, mechanism: 'the pack manifest.', events: events.filter((e) => e.kind === 'born'), later: events.filter((e) => e.kind !== 'born') });
    } else out.push({ id, mechanism: null, events: [] });
  }
  return out;
}

// The manifest's leading comment block: the pack-level decisions written where a
// reader of the code finds them, and the `_pack` entries' evidence.
function manifestHeader(io, pack) {
  const lines = [];
  for (const l of (io.read(`${pack}/pack.mjs`) ?? '').split('\n')) {
    if (/^\s*\/\//.test(l)) { lines.push(l.replace(/^\s*\/\/ ?/, '')); continue; }
    if (l.trim() === '' && !lines.length) continue;
    if (l.trim() === '') { lines.push(''); continue; }
    break;
  }
  while (lines.length && lines[lines.length - 1] === '') lines.pop();
  return lines;
}

// The fields every entry of one commit shares, written once per commit as the
// defaults fence apply merges under each entry's own fields.
// `Landed` carries only what git vouches for: where the change landed, and the version
// where a row or the commit's own diff says so. The issues it references are NOT written
// here even though the trailer names them - the trailer's keyword is the branch author's
// and the pull request body's is usually a different one, and a defaults fence copies
// whatever it holds onto every entry under it, so one wrong keyword fans out across a
// whole commit's elements. The brief prints the trailer's references beside the fence
// for the run to resolve against the pull request body instead (#2221).
function sharedFields(info, version, owner) {
  const at = info.pr ? `#${info.pr}` : `commit ${info.short}`;
  return {
    Actor: info.handle ? `@${info.handle}${info.handle === owner ? ' (owner)' : ''}.` : null,
    Model: info.models.length ? `${info.models.join(', ')}, per the commit trailer.` : null,
    Landed: `${at}${version ? ` · pack version ${version}` : ''}.`,
  };
}
const fieldLines = (fields) => Object.entries(fields).filter(([, v]) => v).map(([k, v]) => `- **${k}:** ${v}`);

// The carrier the element was born in, which a followed birth predates the move to: the
// mechanism naming today's file is a true sentence about the wrong date. Only the shapes the
// text search can reach are named; any other old carrier keeps today's mechanism for the run
// to correct, since a drafted shape nobody derived is the guess this lane exists to avoid.
function mechanismAt(file, el) {
  if (el.check) return `check ${el.check}, in ${file}.`;
  const skill = /\/skills\/([^/]+)\/SKILL\.md$/.exec(file);
  if (skill) return `a guideline of the ${skill[1]} skill, triggered on "${el.needle}".`;
  if (file.endsWith('/RULES.md')) return `a RULES.md rule, triggered on "${el.needle}".`;
  return null;
}

function draftEntry(el, ev, info) {
  const fields = {};
  if (ev.kind === 'born') fields.Mechanism = (el.followed && mechanismAt(el.followed.files[0], el)) || el.mechanism;
  else if (ev.from) fields.Mechanism = `${el.mechanism} it was carried by ${ev.from.join(', ')} until here; say why the carrier changed.`;
  return renderEntry({ date: info.date, kind: ev.kind, title: `${info.title} (${info.pr ? `#${info.pr}` : info.short})`, fields });
}

export function brief(root, pack, wanted = []) {
  const io = checkoutIo(root);
  const cache = new Map();
  const owner = repoOwner(root);
  const rows = versionRows(io, pack);
  const introducers = rowIntroducers(root, pack, rows);
  const ownCut = versionReader(root, pack);
  const paths = packPaths(root, pack, io);
  const position = positionsOf(root);
  const elements = packElements(root, pack, io, wanted, { paths, position });
  const byCommit = new Map();  // sha → [{ el, ev }], in date order
  const sweeps = new Map();    // sha → element ids it touched
  const unknown = [];
  for (const el of elements) {
    if (!el.events.length) { unknown.push(el.id); continue; }
    for (const ev of el.events) {
      const info = commitInfo(root, ev.sha, cache);
      // A sweep re-wraps what it touches; the element it bore is still born there.
      if (info.sweep && ev.kind !== 'born' && el.id !== PACK_ELEMENT) { if (!sweeps.has(ev.sha)) sweeps.set(ev.sha, []); sweeps.get(ev.sha).push(el.id); continue; }
      if (!byCommit.has(ev.sha)) byCommit.set(ev.sha, []);
      byCommit.get(ev.sha).push({ el, ev });
    }
  }
  // Oldest first in the history's own order: a date ties every commit of one day.
  const order = [...byCommit.keys()].map((sha) => cache.get(sha)).sort((a, b) => (position.get(a.sha) ?? 0) - (position.get(b.sha) ?? 0));
  const lines = [`# ${pack} · backfill brief`, ''];
  const count = (n, what) => `${n} ${what}${n === 1 ? '' : 's'}`;
  lines.push(`${count(elements.length, wanted.length ? 'element' : 'pending file')} · ${count(order.length, 'pack-local commit')} · ${count(sweeps.size, 'sweep')}`);
  if (paths.length > 1) lines.push('', `this pack has moved: its history is read under ${paths.join(', ')}, and a row naming a file in full is from before the move`);
  const converted = [...provenanceFiles(pack, io)].filter(([, f]) => f.convertedOnly).map(([id]) => id);
  if (converted.length) {
    lines.push('', '## files the references conversion filled', 'each holds one born entry dated by the CONVERSION rather than by the element, plus the Reason and Retire when the doc carried. these are drafted below like an empty file; where the real birth is earlier, `apply --backfill` merges the derived history in date order and drops the placeholder, and where the placeholder date IS the birth it stands - read each file\'s own evidence rather than truncating them as a class');
    for (const id of converted) lines.push(`- ${fileOfId(id)}`);
  }
  lines.push('');
  lines.push('## every commit that touched this pack');
  lines.push('oldest first, each with the files it touched under the pack, the version row that claims it, and what it drafts below. a row reading NOTHING DRAFTED decided nothing, re-wrapped, or decided something no carrier\'s text shows - read its files before passing it');
  lines.push(`a commit touching ${SWEEP_PACKS} or more packs is marked "sweep": it goes on _pack.md where it changed the pack's shape, and on an element only where it decided something about that one - never where it merely re-wrapped it`);
  const claimed = new Set();
  for (const i of packCommits(root, paths, cache)) {
    const drafts = (byCommit.get(i.sha) ?? []).map(({ el, ev }) => `${el.id} (${ev.kind})`);
    const swept = sweeps.get(i.sha) ?? [];
    const row = rowFor(rows, introducers, i);
    if (row) claimed.add(row.version);
    const parts = [filesUnder(i, paths).join(', ') || '(nothing under the pack)'];
    if (row) parts.push(`version ${row.version} "${row.what}"`);
    if (i.sweep) parts.push('sweep');
    parts.push([...drafts, ...swept.map((id) => `${id} (set aside)`)].join(', ') || 'NOTHING DRAFTED');
    lines.push(`- ${i.pr ? `#${i.pr}` : i.short} ${i.date} ${i.title} · ${parts.join(' · ')}`);
  }
  const orphans = rows.filter((r) => !claimed.has(r.version));
  if (orphans.length) {
    lines.push('', '## version rows no commit here claims', 'the row names the decision and the pull request that made it; neither reached a commit subject, so this is history the drafts below cannot carry');
    for (const r of orphans) lines.push(`- ${r.version} ${r.date} ${r.what}`);
  }
  if (unknown.length) { lines.push('', '## no history found', `git holds no commit for: ${unknown.join(', ')} (is the clone shallow?)`); }
  const followed = elements.filter((el) => el.followed);
  if (followed.length) {
    lines.push('', '## elements older than the carrier they sit in', 'the birth below is drafted at the EARLIER carrier the pickaxe found, and the commit that would otherwise have read as the birth is drafted as the move or conversion it is. verify each against the old path before trusting it - `git show <sha>:<old path>`');
    for (const el of followed) lines.push(`- ${el.id}: ${el.followed.kind} into ${el.carrier}; carried by ${el.followed.files.join(', ')} from ${el.followed.date} (${el.followed.sha.slice(0, 8)})`);
  }
  const unfollowed = elements.filter((el) => el.unfollowed);
  if (unfollowed.length) {
    lines.push('', '## births the search could not go behind', 'no carrier the pack has held holds the element\'s text before the birth drafted below, yet something says the element is older, so that birth is an ASSUMPTION rather than a derivation - an element REWORDED before it moved carries different text and cannot be followed by its text at all. read the evidence named beside each, `git show <sha>:<old path>`, before trusting the draft. (an unfollowable birth with nothing against it is an ordinary one and is not listed)');
    for (const el of unfollowed) {
      const at = el.unfollowed.listedAt;
      const i = at ? commitInfo(root, at.sha, cache) : null;
      const why = [i ? `${at.file} listed it at ${at.date} (${i.pr ? `#${i.pr}` : i.short}), a table row that carries nothing` : null,
        el.unfollowed.shrank ? `the birth commit took text out of ${el.unfollowed.shrank}` : null].filter(Boolean);
      lines.push(`- ${el.id}: nothing earlier carries "${el.needle}"; ${why.join(', and ')}`);
    }
  }
  const manifest = elements.find((el) => el.id === PACK_ELEMENT);
  if (manifest) {
    lines.push('', `## the manifest, ${pack}/pack.mjs`, 'its header comment is the pack-level record the _pack entries are written from, and is trimmed like the README once they are; a _pack entry is a decision about the pack\'s shape, never every change in its scope, so the manifest\'s later commits are listed here and not drafted');
    const header = manifestHeader(io, pack);
    lines.push(...(header.length ? header.map((l) => (l ? `> ${l}` : '>')) : ['(no header comment)']));
    for (const ev of manifest.later) { const i = commitInfo(root, ev.sha, cache); lines.push(`- ${i.pr ? `#${i.pr}` : i.short} ${i.date} ${i.title}${i.sweep ? ' (sweep)' : ''}`); }
  }
  const readme = io.read(`${pack}/README.md`);
  if (readme) {
    lines.push('', '## README sentences that read as history', 'each moves onto the entry it evidences and leaves the README');
    const prose = readme.split('\n').filter((l) => !l.startsWith('|') && !l.startsWith('#')).join('\n');
    const tells = prose.split(/(?<=[.!?])\s+/).filter((s) => /#\d+|\buntil\b|\bdistilled from\b|\bkept as\b|\breplaced\b|\babsorbed\b|\b20\d\d-\d\d-\d\d\b/.test(s));
    lines.push(tells.map((s) => `- ${s.replace(/\s+/g, ' ').trim()}`).join('\n') || '(none)');
    // The sentence tells find history that dates or numbers itself. A section that explains
    // WHY an element reads as it does carries neither, so the headings go up whole and the
    // session judges each: prose the adopter uses stays, the rest is an entry's Reason.
    lines.push('', '## README sections', 'every heading, the prose under it and its tables. a section explaining why an element reads as it does is an entry\'s Reason, not the README\'s - the adopter\'s half is what the pack activates on, what each element demands, and when to reach for it. a table is counted separately because either answer is possible and the byte count is what says which is at stake: an evidence or per-member table is history and moves onto the entries it evidences, a catalog of what the pack carries stays');
    const sections = [];
    for (const l of readme.split('\n')) {
      if (/^#{1,6} /.test(l)) { sections.push({ heading: l, bytes: 0, table: 0 }); continue; }
      if (!sections.length) continue;
      if (l.startsWith('|')) { sections[sections.length - 1].table += l.trim().length; continue; }
      sections[sections.length - 1].bytes += l.trim().length;
    }
    for (const s of sections) lines.push(`- ${s.heading} · ${s.bytes} bytes of prose${s.table ? ` · ${s.table} bytes of table` : ''}`);
  }
  for (const info of order) {
    const drafts = byCommit.get(info.sha);
    lines.push('', `## ${info.pr ? `PR #${info.pr}` : `commit ${info.short}`} · ${info.date} · ${info.title}`);
    const version = versionFor(rows, introducers, info, ownCut);
    const facts = [info.handle ? `by @${info.handle}` : null, info.models.length ? `model ${info.models.join(', ')}` : null, version ? `pack version ${version}` : null].filter(Boolean);
    if (facts.length) lines.push(`- ${facts.join(' · ')}`);
    if (info.refs.length) lines.push(`- the commit trailer references ${info.refs.map((r) => `${r.keyword} #${r.n}`).join(', ')} - READ THE PULL REQUEST BODY for the keyword it used and write that into Landed. the two disagree on most older pull requests, the body's Closes being what fills GitHub's Development panel and the trailer's Refs linking nothing there`);
    lines.push(`- ${drafts.map(({ el, ev }) => `${el.id} (${ev.kind})`).join(', ')}`);
    if (info.body) {
      const body = info.body.split('\n');
      lines.push('', ...body.slice(0, BODY_LINES).map((l) => (l ? `> ${l}` : '>')));
      if (body.length > BODY_LINES) lines.push(`> (… ${body.length - BODY_LINES} more lines: git show ${info.short})`);
    }
    lines.push('', 'the defaults go under every entry below them; fill Source, Reason, Rejected and Retire when where the evidence carries them, there or on one entry; delete a draft the commit did not decide');
    lines.push('```entry-defaults', ...fieldLines(sharedFields(info, version, owner)), '```');
    for (const { el, ev } of drafts) lines.push(`\`\`\`entry ${el.id}`, draftEntry(el, ev, info).trimEnd(), '```');
  }
  return lines;
}

const DEFAULTS_FENCE = /^```entry-defaults\s*$/;
const FIELDS_ORDER = provenance.FIELDS ?? [];
const orderedFields = (fields) => Object.fromEntries(Object.entries(fields).sort(([a], [b]) => FIELDS_ORDER.indexOf(a) - FIELDS_ORDER.indexOf(b)));

// Apply an edited brief: every entry fence in it, validated as one batch against the
// files it would join, appended each once - a heading already in its file is skipped,
// so a second apply writes nothing - and none written while any one is refused.
//
// `--backfill` is the one lane licensed to write a file's PAST, and it exists because a
// backfill is deriving history that already happened: its entries are dated before
// whatever the file holds, which the ordinary append lane refuses and should. Under it a
// file is re-rendered in date order rather than appended to, a placeholder born the
// references conversion left is dropped where the derived born is earlier, and a file
// missing entirely is created where the batch opens with born. Every other caller -
// every change being made now - goes through the append lane, where a file only ever
// grows at its end.
export function apply(root, pack, text, { backfill = false } = {}) {
  const io = checkoutIo(root);
  const fences = [];
  const problems = [];
  let cur = null;
  let defaults = {};
  for (const line of String(text).split('\n')) {
    if (!cur) {
      if (DEFAULTS_FENCE.test(line)) { cur = { element: null, lines: [] }; continue; }
      const m = ENTRY_FENCE.exec(line);
      if (m) cur = { element: m[1], lines: [] };
      continue;
    }
    if (!line.startsWith('```')) { cur.lines.push(line); continue; }
    if (cur.element) fences.push({ element: cur.element, text: `${cur.lines.join('\n')}\n`, defaults });
    else {
      const parsed = parseEntryText(`## 2000-01-01 · born · defaults\n${cur.lines.join('\n')}\n`);
      if (parsed.problems.length) problems.push(...parsed.problems.map((p) => `a defaults fence: ${p}`));
      else defaults = parsed.entry.fields;
    }
    cur = null;
  }
  const pending = new Map();  // file → text after every append so far
  const skipped = [];
  const superseded = [];
  const created = [];
  // A file's entries go in date order whatever order the brief was edited into; a stable
  // sort keeps the brief's order within one day.
  const dated = fences.map((f, i) => ({ ...f, i, date: /^## (\d{4}-\d{2}-\d{2})/.exec(f.text)?.[1] ?? '' }))
    .sort((a, b) => a.element.localeCompare(b.element) || a.date.localeCompare(b.date) || a.i - b.i);
  const byFile = new Map();   // file → { element, declined, entries: [] }, in that order
  for (const f of dated) {
    const declined = f.element === '_declined';
    const file = `${pack}/${PROVENANCE_DIR}/${declined ? DECLINED_FILE : fileOfId(f.element)}`;
    const parsed = parseEntryText(f.text);
    if (parsed.problems.length) { problems.push(...parsed.problems.map((p) => `${f.element}: ${p}`)); continue; }
    const entry = { ...parsed.entry, fields: orderedFields({ ...f.defaults, ...parsed.entry.fields }) };
    if (scrub(renderEntry(entry)) !== renderEntry(entry)) { problems.push(`${f.element}: the entry carries what reads as a secret`); continue; }
    if (!byFile.has(file)) byFile.set(file, { element: f.element, declined, entries: [] });
    byFile.get(file).entries.push(entry);
  }
  for (const [file, f] of byFile) {
    const opts = f.declined ? { kinds: [DECLINED_KIND], firstKind: null } : {};
    // A backfill batch is allowed to write a file that is not there: an element retired
    // before the marking pass has no file and never will get one from a carrier, so its
    // whole history - born through retired - arrives in one batch or not at all (#2222).
    const exists = io.exists(file);
    if (!exists && !f.declined && !(backfill && f.entries[0]?.kind === 'born')) {
      problems.push(`${f.element}: ${file} does not exist${backfill ? ', and the batch does not open with born' : ''}`);
      continue;
    }
    if (!exists && !f.declined) created.push(file);
    const existing = io.read(file) ?? '';
    if (backfill && !f.declined) {
      const result = backfilledText(existing, f.entries, opts);
      superseded.push(...result.superseded.map((s) => `${f.element}: ${s}`));
      if (result.problems.length) { problems.push(...result.problems.map((p) => `${f.element}: ${p}`)); continue; }
      pending.set(file, result.text);
      continue;
    }
    let text = existing;
    for (const entry of f.entries) {
      const heading = renderEntry(entry).split('\n')[0];
      if (text.split('\n').includes(heading)) { skipped.push(f.element); continue; }
      const result = appendedText(text, entry, opts);
      if (result.problems.length) { problems.push(...result.problems.map((p) => `${f.element}: ${p}`)); break; }
      text = result.text;
    }
    if (text !== existing) pending.set(file, text);
  }
  if (problems.length) return { problems, written: [], skipped, superseded, created };
  for (const [file, content] of pending) io.write(file, content);
  return { problems: [], written: [...pending.keys()], skipped, superseded, created };
}

// --- main ---------------------------------------------------------------------------

export async function main(argv = process.argv.slice(2), { root = process.env.CLAUDE_PROJECT_DIR || process.cwd(), stdin = null } = {}) {
  if (typeof provenance.auditPack !== 'function') {
    console.error('this engine predates the provenance helper - converge the mount first');
    return 2;
  }
  const [command, ...rest] = argv;
  const flags = new Set(rest.filter((a) => a.startsWith('--') && !['--kind', '--date'].includes(a)));
  const valueOf = (flag) => { const i = rest.indexOf(flag); return i === -1 ? null : rest[i + 1]; };
  const positional = rest.filter((a, i) => !a.startsWith('--') && rest[i - 1] !== '--kind' && rest[i - 1] !== '--date');
  const io = checkoutIo(root);
  const packsFor = (id) => {
    if (flags.has('--all')) return allPacks(io);
    const dir = id && resolvePack(root, id, io);
    if (!dir) { console.error(`no pack "${id ?? ''}" under ${PACK_ROOTS.join(' or ')}`); return null; }
    return [dir];
  };
  switch (command) {
    case 'mark': {
      const packs = packsFor(positional[0]); if (!packs) return 2;
      const { lines } = mark(root, packs, { dryRun: flags.has('--dry-run') });
      console.log(lines.join('\n'));
      return 0;
    }
    case 'check': {
      const packs = packsFor(positional[0]); if (!packs) return 2;
      const { lines, faults } = check(root, packs);
      console.log(lines.join('\n'));
      return faults ? 1 : 0;
    }
    case 'convert-references': {
      const packs = packsFor(positional[0]); if (!packs) return 2;
      const lines = convert(root, packs);
      console.log(lines.join('\n') || 'no references.md to convert');
      return 0;
    }
    case 'append': {
      const packs = packsFor(positional[0]); if (!packs) return 2;
      const pack = packs[0];
      const elements = flags.has('--changed') ? changedElements(root, pack) : positional.slice(1, 2);
      if (!elements.length) { console.error(flags.has('--changed') ? 'the working tree changed no carrier of this pack' : 'append needs an element id'); return 2; }
      const text = stdin ?? readFileSync(0, 'utf8');
      if (flags.has('--backfill') && typeof backfilledText !== 'function') { console.error('this engine predates the backfill lane - converge the mount first'); return 2; }
      const { problems, written } = append(root, pack, elements, text, { kind: valueOf('--kind'), date: valueOf('--date'), backfill: flags.has('--backfill') });
      if (problems.length) { console.error(problems.join('\n')); return 1; }
      console.log(written.map((f) => `${f}: appended`).join('\n'));
      return 0;
    }
    case 'reduce': {
      const file = positional[0];
      if (!file || !io.exists(file)) { console.error('reduce needs a file'); return 2; }
      process.stdout.write(reduceFile(io.read(file), { publicCanon: flags.has('--public') }));
      return 0;
    }
    case 'history': {
      const packs = packsFor(positional[0]); if (!packs) return 2;
      if (!positional[1]) { console.error('history needs an element id'); return 2; }
      console.log(history(root, packs[0], positional[1]).join('\n'));
      return 0;
    }
    case 'brief': {
      const packs = packsFor(positional[0]); if (!packs) return 2;
      console.log(brief(root, packs[0], positional.slice(1)).join('\n'));
      return 0;
    }
    case 'apply': {
      const packs = packsFor(positional[0]); if (!packs) return 2;
      const file = positional[1];
      if (!file) { console.error('apply needs the brief file'); return 2; }
      const backfill = flags.has('--backfill');
      if (backfill && typeof backfilledText !== 'function') { console.error('this engine predates the backfill lane - converge the mount first'); return 2; }
      const { problems, written, skipped, superseded = [], created = [] } = apply(root, packs[0], readFileSync(file, 'utf8'), { backfill });
      if (problems.length) { console.error(problems.join('\n')); return 1; }
      console.log(written.length ? written.map((f) => `${f}: ${backfill ? 'written in date order' : 'appended'}`).join('\n') : 'nothing to append');
      if (created.length) console.log(`created: ${created.join(', ')}`);
      if (superseded.length) console.log(`the conversion's placeholder replaced by an earlier born: ${superseded.join('; ')}`);
      if (skipped.length) console.log(`already in its file, skipped: ${[...new Set(skipped)].join(', ')}`);
      return 0;
    }
    default:
      console.error(USAGE);
      return 2;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then((code) => { process.exitCode = code; }).catch((e) => { console.error(`provenance: ${e.message}`); process.exitCode = 1; });
}
