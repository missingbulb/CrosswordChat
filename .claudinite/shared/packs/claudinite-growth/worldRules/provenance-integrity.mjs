import { finding } from '../../../engine/checks/helpers/findings.mjs';
// A namespace import, guarded below: the pack and engine lanes deliver on separate
// cadences, and a member whose engine predates the helper must load this pack rather
// than fault on a missing named export.
import * as provenance from '../../../engine/checks/helpers/provenance.mjs';

// THE WORLD HALF of the provenance convention (the provenance design, #2136): every
// carrier of every pack under either root names a live provenance file, every
// provenance file parses, and a file with entries opens with born and carries
// Mechanism where its kind demands one. A member's local packs and a canon's shelf are
// judged alike; the mount is never scanned (ctx.files excludes it).
//
// AGGREGATED PER FILE where a fault repeats: a RULES.md with twenty unmarked rules is
// one finding naming the count and the first, not twenty - the fix is one command over
// the pack either way. A dangling marker, an unnamed file, a bodyless skill and a
// grammar fault are each their own finding, because each has its own line.
//
// TWO ADVISORY BRANCHES inside a blocking rule: an EMPTY file is pending history, the
// backfill's worklist and not a defect; a pack-root references.md is the retired
// convention still in place, tolerated at advisory through the conversion window.
//
// A GUIDELINES SKILL'S BULLET carries a marker only where its history has a file of its
// own; unmarked, it is the skill's, covered by the file the skill names, so the unmarked
// finding names RULES.md rules alone. Two carriers may name one file while their history
// is one (the owner's call, 2026-09-20).
//
// RELEVANCE-FIRST: inert in a repo that carries no pack under either root.
const PACK = 'claudinite-growth';
const toolPath = (ctx) => (ctx.exists(`packs/${PACK}/provenance.mjs`) ? `packs/${PACK}/provenance.mjs` : `.claudinite/shared/packs/${PACK}/provenance.mjs`);
const packId = (dir) => dir.slice(dir.lastIndexOf('/') + 1);

const rule = {
  id: 'provenance-integrity',
  severity: 'blocking',
  since: '2026-09-20',
  doc: 'packs/claudinite-growth/skills/changing-pack-elements/SKILL.md',
  description: 'Every pack carrier names a live provenance file, and every provenance file parses',
  why: 'a rule with no file has no id an override can name and no log a review can reaffirm it against, and a file nothing names is history of an element that is gone',

  run(ctx) {
    if (typeof provenance.auditPack !== 'function') return []; // an engine that predates the helper
    const { auditPack, packDirsIn, fileOfId, PROVENANCE_DIR } = provenance;
    const packs = packDirsIn(ctx.files);
    if (!packs.length) return [];
    const io = { exists: (p) => ctx.exists(p), read: (p) => ctx.read(p), listDir: (p) => listFrom(ctx.files, p) };
    const tool = toolPath(ctx);
    const out = [];
    for (const dir of packs) {
      const a = auditPack(dir, io);
      const id = packId(dir);
      const mark = `run \`node ${tool} mark ${id}\` and refine the proposed slugs before landing`;
      const byFile = new Map();
      for (const u of a.unmarked) { if (!byFile.has(u.file)) byFile.set(u.file, []); byFile.get(u.file).push(u); }
      for (const [file, list] of byFile) {
        out.push(finding(rule, {
          file, line: list[0].line,
          what: `${list.length} rule${list.length === 1 ? '' : 's'} end${list.length === 1 ? 's' : ''} with no marker naming a provenance file (first: "${list[0].trigger}")`,
          fix: mark,
        }));
      }
      for (const d of a.dangling) {
        out.push(finding(rule, {
          file: d.file, line: d.line,
          what: `${d.carrier} names ${dir}/${PROVENANCE_DIR}/${fileOfId(d.id)}, which is ${d.retired ? 'retired - its last entry retired the element' : 'not a file'}`,
          fix: d.retired
            ? 'a retired element carries no live carrier: remove the carrier, or give the element a new file and a born entry'
            : `create the file the carrier names (\`node ${tool} mark ${id}\` creates every missing one), or fix the marker to the file it meant`,
        }));
      }
      for (const u of a.unnamed) {
        out.push(finding(rule, {
          file: u.file,
          what: `is live, and no carrier of ${dir} names ${fileOfId(u.id)}`,
          fix: 'append a retired entry if the element is gone, or restore the marker or id that named it',
        }));
      }
      for (const n of a.noBody) {
        out.push(finding(rule, {
          file: n.file,
          what: `skill ${n.skill} declares no body`,
          fix: `add \`body: workflow\` or \`body: guidelines\` under its frontmatter metadata (\`node ${tool} mark ${id}\` proposes one from the shape)`,
        }));
      }
      for (const m of a.markerInWorkflow) {
        out.push(finding(rule, {
          file: m.file, line: m.line,
          what: `"${m.trigger}" ends with the marker (${m.slug}) inside a skill whose body is a workflow`,
          fix: 'a workflow\'s steps owe their entries to the skill\'s own file: drop the marker, or declare the skill body: guidelines',
        }));
      }
      for (const e of [...a.parseErrors, ...a.entryFaults]) {
        out.push(finding(rule, {
          file: e.file, line: e.line,
          what: e.what,
          fix: 'write the entry in the file grammar - `## <YYYY-MM-DD> · <kind> · <one line>` and `- **Field:** …` lines, appended in date order, born first, Mechanism on every mechanism-bearing kind - through `append`, which validates it',
        }));
      }
      // Pending history is one line per pack, not one per file: it is the backfill's
      // worklist, and a worklist is read as a count.
      if (a.empty.length) {
        const ids = a.empty.map((e) => fileOfId(e.id)).sort();
        out.push(finding(rule, {
          file: `${dir}/${PROVENANCE_DIR}`, severity: 'advisory',
          what: `${ids.length} provenance file${ids.length === 1 ? ' is' : 's are'} empty - elements whose history is not written yet (${ids.slice(0, 3).join(', ')}${ids.length > 3 ? ', …' : ''})`,
          fix: 'the backfill fills them from each carrier\'s history (the backfilling-provenance skill), one pack per pull request; nothing else is owed',
        }));
      }
      // @legacy-tolerance advisory:provenance-integrity retire:#2170
      if (a.referencesDoc) {
        out.push(finding(rule, {
          file: a.referencesDoc, severity: 'advisory',
          what: 'a pack-root references.md is the retired rationale convention',
          fix: `run \`node ${tool} convert-references ${id}\` - each entry becomes an entry on the element its key names, the numeric markers become slugs, and the doc goes`,
        }));
      }
    }
    return out;
  },
};

// A directory listing off the run's file list, so the audit walks exactly what the
// run scans: names one segment below `p`, or null where nothing is under it.
function listFrom(files, p) {
  const names = new Set();
  const prefix = `${p}/`;
  for (const f of files) {
    const n = f.replace(/\\/g, '/');
    if (n.startsWith(prefix)) names.add(n.slice(prefix.length).split('/')[0]);
  }
  return names.size ? [...names] : null;
}

export default rule;
