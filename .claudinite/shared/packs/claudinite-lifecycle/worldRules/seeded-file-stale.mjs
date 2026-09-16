import { relative, sep } from 'node:path';
import { finding } from '../../../engine/checks/helpers/findings.mjs';
import { isActive } from '../../../engine/pack_loader/pack-registry.mjs';

// A pack's `seedOps` file is written ONCE, at adoption, and owned by the repo from
// there. When the pack later reshapes the template, nothing carries the new shape to a
// member that already has the old one — the install writes only an absent dest, and the
// two files a `seedOps` typically names (`.github/workflows/`) are the one directory a
// converge may not push to at all.
//
// So the member goes on running a file the pack has moved out from under. The canary's
// dashboard stub kept invoking `packs/claudinite-dashboard/build-site.mjs` for a day
// after the pack moved that module to `tooling/`, and every deploy since died
// `MODULE_NOT_FOUND` — while the page went on serving the last tree the old in-workflow
// build produced, so nothing anybody looked at said the deploy was broken.
//
// The member cannot be FIXED automatically. It can be told, which is this.
//
// WHAT COUNTS AS STALE, since a member is entitled to edit its own copy: the member's
// file must carry every significant line of the template its OWN mount ships — its
// stamped pack version's template, since that is the tree the mount holds. Lines the
// member added are its business and are not read; lines the template has that the copy
// does not are the pack having moved while the copy stood still. Comments and blank
// lines are dropped from both sides and whitespace is normalized, so re-wrapping a
// comment or re-indenting is not drift.
//
// That relaxation costs something real and is worth naming: a member that EDITED a
// template line — pinned a different action version, changed a trigger — reads as
// missing that line and is told about a divergence it chose. Advisory is the answer to
// that, not a narrower comparison: the finding says what differs and the reader decides,
// where a rule that tried to guess which edits were deliberate would go quiet on the
// reshape this exists to catch.
//
// ADVISORY, for `conformance-workflow`'s reason: the remedy is usually a human-merged PR
// to `.github/workflows/`, the one fix a member's own machinery cannot make. Blocking
// would turn such a member red every night with no move of its own to clear it.
const rule = {
  id: 'seeded-file-stale',
  severity: 'advisory',
  description: "A file a pack seeded at adoption still carries every line of that pack's current template",
  doc: 'packs/claudinite-lifecycle/README.md',
  why: 'a seeded file is written once and never converged, so a pack that reshapes its template leaves every existing member running the adoption-era copy — which fails wherever the pack has since moved, with nothing anywhere saying so',

  run(ctx) {
    const out = [];
    for (const pack of (ctx.packs ?? []).filter((p) => isActive(p, ctx.config))) {
      for (const { template, dest } of pack.seedOps ?? []) {
        // The template as THIS repo holds it: the mount's copy in a member, the pack's
        // own directory in the canon. `pack.dir` is where the pack was discovered, so
        // one expression covers both roots.
        const from = relative(ctx.root, `${pack.dir}${sep}${template.split('/').join(sep)}`).split(sep).join('/');
        const want = ctx.read(from);
        const have = ctx.read(dest);
        // No template is a broken mount, not a stale member, and a missing dest is a
        // repo that never adopted this pack's seed — neither is this rule's finding.
        if (want === null || have === null) continue;

        const carried = new Set(significantLines(have));
        const missing = significantLines(want).filter((l) => !carried.has(l));
        if (!missing.length) continue;
        out.push(finding(rule, {
          file: dest,
          what: `was seeded from ${pack.id}'s ${template} and no longer carries ${missing.length === 1 ? 'a line' : `${missing.length} lines`} that template has — the first is \`${missing[0]}\``,
          fix: `re-seed it — \`cp ${from} ${dest}\` — then re-apply whatever this repo deliberately changed in its copy`
            + (dest.startsWith('.github/workflows/')
              ? ', and get that PR merged: a converge cannot push to .github/workflows/, which is why nothing delivered the change'
              : ''),
        }));
      }
    }
    return out;
  },
};

// A file reduced to the lines that instruct something. Comments go because a reworded
// one is not drift; blanks and indentation go for the same reason. Both `#` and `//`
// are stripped, since `seedOps` names whatever file a pack seeds and not only YAML.
const significantLines = (text) => text.split('\n')
  .map((l) => l.trim())
  .filter((l) => l && !l.startsWith('#') && !l.startsWith('//'));

export default rule;
