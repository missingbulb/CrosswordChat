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
//   node <path-to-this-file> apply <pack> <brief.md>
//
// In a member the path is .claudinite/shared/packs/claudinite-growth/provenance.mjs; in
// the canon, packs/claudinite-growth/provenance.mjs. The append reads one entry in the
// file grammar from stdin - `## <date> · <kind> · <title>` and its `- **Field:** …`
// lines - and refuses one that carries a secret, since a decision log is prose an
// agent writes and the one place nothing else scans.
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
  checkoutIo, auditPack, markPack, convertReferences, appendedText, parseEntryText, packCarriers,
  provenanceFiles, reduceFile, fileOfId, elementIdOf, ruleBlocks, skillShape, parseEntries, renderEntry,
  PACK_ROOTS, PROVENANCE_DIR, DECLINED_FILE, DECLINED_KIND, PACK_ELEMENT,
} = provenance;

const USAGE = `usage: provenance.mjs <command> …
  mark <pack>|--all [--dry-run]          markers, bodies and empty files for every carrier
  check <pack>|--all                     what each file is named by, and every fault
  convert-references <pack>|--all        the references.md of a pack into its elements' files
  append <pack> <element> [--kind K] [--date D] [--changed] < entry.md
  reduce <file> [--public]               the promotion reduction, to stdout
  history <pack> <element>               one element's raw evidence from git, VERSIONS.md and the README
  brief <pack> [<element>…]              the backfill brief: every pull request once, a draft entry per event
  apply <pack> <brief.md>                append every drafted entry of an edited brief, each once`;

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
    if (a.carriers.manifest) name(PACK_ELEMENT, 'the manifest');
    lines.push(`${pack}/${PROVENANCE_DIR}/`);
    for (const [id, f] of [...a.files].sort()) lines.push(`  ${fileOfId(id)} ← ${(namedBy.get(id) ?? ['nothing']).join(', ')}${f.status === 'retired' ? ' (retired)' : f.empty ? ' (empty)' : ''}`);
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

export function append(root, pack, elements, entryText, { kind = null, date = null } = {}) {
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
    if (!declined && !io.exists(file)) return { problems: [`${file} does not exist - no carrier of ${pack} names an element "${element}" (run mark, or check the id)`] };
    const result = appendedText(io.read(file) ?? '', entry, declined ? { kinds: [DECLINED_KIND], firstKind: null } : {});
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
const REFERENCED = /\b(?:Refs|Fixes|Closes|Resolves)\s*:?\s*#(\d+)/gi;
const PR_AT_END = /\s*\(#(\d+)\)\s*$/;
const ENTRY_FENCE = /^```entry (\S+)\s*$/;
const BODY_LINES = 60;

// One commit, read once: what the squash merge carried, and how many packs it touched.
function commitInfo(root, sha, cache) {
  if (cache.has(sha)) return cache.get(sha);
  const [full, short, date, email, subject, body = ''] = git(root, 'show', '-s', '--format=%H%x00%h%x00%as%x00%ae%x00%s%x00%b', sha).split('\0');
  const models = new Set();
  const lines = [];
  for (const l of (body ?? '').split('\n')) {
    const m = MODEL_TRAILER.exec(l.trim());
    if (m) { models.add(m[1].trim()); continue; }
    if (TRAILER.test(l.trim())) continue;
    lines.push(l.trimEnd());
  }
  const pr = PR_AT_END.exec(subject ?? '')?.[1] ?? null;
  const refs = [...new Set([...(body ?? '').matchAll(REFERENCED)].map((m) => m[1]).filter((n) => n !== pr))];
  const packs = new Set();
  for (const f of git(root, 'diff-tree', '--root', '-r', '-m', '--first-parent', '--no-commit-id', '--name-only', sha).split('\n')) {
    const m = /^(?:\.claudinite\/local\/)?packs\/([^/]+)\//.exec(f);
    if (m) packs.add(m[1]);
  }
  // GitHub's own squash line names a bare "Claude" beside the session's trailer.
  if (models.size > 1) models.delete('Claude');
  const info = {
    sha: full, short, date, subject, pr, refs, models: [...models],
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

// The version a commit landed in: the VERSIONS.md row naming its pull request, else
// the manifest's own history - the version the commit itself set, or the first cut
// after it - since the weekly history task writes the rows late.
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
    if (own && own !== versionAt(`${info.sha}^`)) return own;
    for (const sha of git(root, 'log', '--reverse', '--format=%H', `${info.sha}..HEAD`, '--', `${pack}/pack.mjs`).split('\n').filter(Boolean)) {
      const v = versionAt(sha);
      if (v && v !== own) return v;
    }
    return null;
  };
}
function versionFor(rows, info, fromManifest) {
  const byPr = info.pr && rows.find((r) => r.what.includes(`#${info.pr}`) && !new RegExp(`#${info.pr}\\d`).test(r.what));
  return byPr ? byPr.version : fromManifest(info);
}

// Every element the brief covers, with its carrier and its events.
function packElements(root, pack, io, wanted) {
  const c = packCarriers(pack, io);
  const files = provenanceFiles(pack, io);
  const ids = wanted.length ? wanted : [...files].filter(([, f]) => f.empty).map(([id]) => id);
  const out = [];
  for (const id of ids) {
    const rule = c.rules.find((r) => r.slug === id);
    const guideline = c.guidelines.find((r) => r.slug === id);
    const skill = c.skills.find((s) => s.name === id && s.present);
    const check = c.checks.find((x) => elementIdOf(x.id) === id);
    const task = c.tasks.find((t) => t.id === id);
    if (rule) out.push({ id, mechanism: `a RULES.md rule, triggered on "${rule.trigger}".`, events: ruleEvents(root, rule.file, rule, (t) => ruleBlocks(t)) });
    else if (guideline) out.push({ id, mechanism: `a guideline of the ${guideline.skill} skill, triggered on "${guideline.trigger}".`, events: ruleEvents(root, guideline.file, guideline, (t) => skillShape(t).bullets) });
    else if (skill) out.push({ id, mechanism: `the ${id} skill, body ${skill.body ?? skill.proposed}, reached by its description.`, events: fileEvents(root, skill.file) });
    else if (check) out.push({ id, mechanism: `check ${check.id}, in ${check.file}.`, events: fileEvents(root, check.file) });
    else if (task) out.push({ id, mechanism: `task ${id}.`, events: fileEvents(root, task.dir, { follow: false }) });
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
function sharedFields(info, version, owner) {
  const at = info.pr ? `#${info.pr}` : `commit ${info.short}`;
  const refs = info.refs.length ? ` (Refs ${info.refs.map((n) => `#${n}`).join(', ')})` : '';
  return {
    Actor: info.handle ? `@${info.handle}${info.handle === owner ? ' (owner)' : ''}.` : null,
    Model: info.models.length ? `${info.models.join(', ')}, per the commit trailer.` : null,
    Landed: `${at}${refs}${version ? ` · pack version ${version}` : ''}.`,
  };
}
const fieldLines = (fields) => Object.entries(fields).filter(([, v]) => v).map(([k, v]) => `- **${k}:** ${v}`);

function draftEntry(el, ev, info) {
  const fields = ev.kind === 'born' ? { Mechanism: el.mechanism } : {};
  return renderEntry({ date: info.date, kind: ev.kind, title: `${info.title} (${info.pr ? `#${info.pr}` : info.short})`, fields });
}

export function brief(root, pack, wanted = []) {
  const io = checkoutIo(root);
  const cache = new Map();
  const owner = repoOwner(root);
  const rows = versionRows(io, pack);
  const fromManifest = versionReader(root, pack);
  const elements = packElements(root, pack, io, wanted);
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
  const position = new Map(git(root, 'rev-list', '--reverse', '--topo-order', 'HEAD').split('\n').map((sha, i) => [sha, i]));
  const order = [...byCommit.keys()].map((sha) => cache.get(sha)).sort((a, b) => (position.get(a.sha) ?? 0) - (position.get(b.sha) ?? 0));
  const lines = [`# ${pack} · backfill brief`, ''];
  const count = (n, what) => `${n} ${what}${n === 1 ? '' : 's'}`;
  lines.push(`${count(elements.length, wanted.length ? 'element' : 'empty file')} · ${count(order.length, 'pack-local commit')} · ${count(sweeps.size, 'sweep')}`);
  lines.push('');
  lines.push('## sweeps');
  lines.push(`commits touching ${SWEEP_PACKS} or more packs, set aside: a sweep goes on _pack.md where it changed the pack's shape, never on an element it re-wrapped`);
  for (const [sha, ids] of sweeps) { const i = cache.get(sha); lines.push(`- ${i.pr ? `#${i.pr}` : i.short} ${i.date} ${i.title} - touched ${ids.join(', ')}`); }
  if (!sweeps.size) lines.push('(none)');
  if (unknown.length) { lines.push('', '## no history found', `git holds no commit for: ${unknown.join(', ')} (is the clone shallow?)`); }
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
  }
  for (const info of order) {
    const drafts = byCommit.get(info.sha);
    lines.push('', `## ${info.pr ? `PR #${info.pr}` : `commit ${info.short}`} · ${info.date} · ${info.title}`);
    const version = versionFor(rows, info, fromManifest);
    const facts = [info.handle ? `by @${info.handle}` : null, info.models.length ? `model ${info.models.join(', ')}` : null, info.refs.length ? `refs ${info.refs.map((n) => `#${n}`).join(', ')}` : null, version ? `pack version ${version}` : null].filter(Boolean);
    if (facts.length) lines.push(`- ${facts.join(' · ')}`);
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
export function apply(root, pack, text) {
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
  // A file's entries go in date order whatever order the brief was edited into; a stable
  // sort keeps the brief's order within one day.
  const dated = fences.map((f, i) => ({ ...f, i, date: /^## (\d{4}-\d{2}-\d{2})/.exec(f.text)?.[1] ?? '' }))
    .sort((a, b) => a.element.localeCompare(b.element) || a.date.localeCompare(b.date) || a.i - b.i);
  for (const f of dated) {
    const declined = f.element === '_declined';
    const file = `${pack}/${PROVENANCE_DIR}/${declined ? DECLINED_FILE : fileOfId(f.element)}`;
    if (!declined && !io.exists(file)) { problems.push(`${f.element}: ${file} does not exist`); continue; }
    const parsed = parseEntryText(f.text);
    if (parsed.problems.length) { problems.push(...parsed.problems.map((p) => `${f.element}: ${p}`)); continue; }
    const entry = { ...parsed.entry, fields: orderedFields({ ...f.defaults, ...parsed.entry.fields }) };
    if (scrub(renderEntry(entry)) !== renderEntry(entry)) { problems.push(`${f.element}: the entry carries what reads as a secret`); continue; }
    const existing = pending.has(file) ? pending.get(file) : (io.read(file) ?? '');
    const heading = renderEntry(entry).split('\n')[0];
    if (existing.split('\n').includes(heading)) { skipped.push(f.element); continue; }
    const result = appendedText(existing, entry, declined ? { kinds: [DECLINED_KIND], firstKind: null } : {});
    if (result.problems.length) { problems.push(...result.problems.map((p) => `${f.element}: ${p}`)); continue; }
    pending.set(file, result.text);
  }
  if (problems.length) return { problems, written: [], skipped };
  for (const [file, content] of pending) io.write(file, content);
  return { problems: [], written: [...pending.keys()], skipped };
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
      const { problems, written } = append(root, pack, elements, text, { kind: valueOf('--kind'), date: valueOf('--date') });
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
      const { problems, written, skipped } = apply(root, packs[0], readFileSync(file, 'utf8'));
      if (problems.length) { console.error(problems.join('\n')); return 1; }
      console.log(written.length ? written.map((f) => `${f}: appended`).join('\n') : 'nothing to append');
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
