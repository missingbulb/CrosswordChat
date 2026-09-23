import { finding } from '../../../engine/checks/helpers/findings.mjs';
// Namespace imports throughout, and every constant read through a `typeof`
// guard: the engine lane and the pack lane converge on separate cycles, so this
// file spends windows beside an engine that predates one of the symbols below.
// A named import of an absent export is a link-time error that faults the whole
// pack; a guarded read simply drops that one advisory, which is the behaviour
// the older engine already has.
import * as settingsNames from '../../../engine/settings-file-names.mjs';
import * as repoContext from '../../../engine/checks/helpers/repo-context.mjs';
import * as renamedPacks from '../../../engine/pack_loader/renamed-packs.mjs';
import * as versionSpec from '../../../engine/version.mjs';
import * as servedBy from '../../../engine/served-by.mjs';

// THE ADVISORY HALF OF EVERY DECLARATION-SHAPE TOLERANCE the engine still
// carries. Each of those tolerances lets a member's own file be read in a shape
// that has since been renamed, and each is removed one convergence window after
// this advisory ships (#1638) - the time a repo converging nightly needs to act on
// its own finding. Nothing was telling the repos, which is why the window needed
// the advisory first.
//
// The tolerances #1640 removed are no longer among them: the retired settings-file
// name, the `claudinite` and `maintenance` blocks, top-level `packConfig`,
// `taskScheduler.endpoints` and the `local_packs/` declaration prefix are read by
// nothing now, and a member still carrying one gets the settings-validity gate's
// blocking error instead of a note. What is left are the shapes that still resolve:
// a renamed or absorbed pack id (#1641), an integer version (#1912) and the
// `updates` mechanism alias (#1643).
//
// A tolerance with no advisory asks people to migrate off something they have no
// way of knowing they are on, so this rule fires in the repo that HOLDS the old
// shape rather than in the canon that tolerates it (basics' *Adding a legacy
// tolerance*). It reads the member's own declaration and stamp and names, per
// finding, the edit that moves it forward.
//
// ADVISORY, permanently. The old shape works — that is what a tolerance means —
// so a blocking finding would stop a member's build over something that is not
// broken. What the advisory buys is that the removal's gate can eventually read
// zero, which is the only way the tolerance ever comes out.
const rule = {
  id: 'legacy-shape-in-use',
  severity: 'advisory',
  since: '2026-09-03',
  description: 'This repo\'s Claudinite declaration and stamp use no shape the engine only tolerates',
  why: 'every legacy shape here is read through a tolerance that comes out one convergence window after this advisory ships (#1638) - the canon cannot see which repos still carry the old shape, so a repo that does not act inside that window loses its mount rather than holding the removal up',

  run(ctx) {
    const file = settingsNames.SETTINGS_FILE;
    if (!ctx.files.includes(file)) return [];              // not a member - inert

    let raw;
    try { raw = JSON.parse(ctx.read(file) ?? ''); } catch { return []; }
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return [];

    const out = [];
    const flag = (what, fix) => out.push(finding(rule, { file, what, fix }));

    for (const key of Array.isArray(repoContext.LEGACY_CONFIG_KEYS) ? repoContext.LEGACY_CONFIG_KEYS : []) {
      if (raw[key] !== undefined) {
        flag(`the declaration carries the retired top-level "${key}" block`,
          'move its contents to their current homes — a pack\'s parameters to that pack\'s entry `config`, the stamp to `engineVersion` plus each entry\'s own `version`, delivery to `requirePrReview` — and delete the block');
      }
    }

    for (const key of Array.isArray(repoContext.RETIRED_SCHEDULE_KEYS) ? repoContext.RETIRED_SCHEDULE_KEYS : []) {
      if (raw.taskScheduler?.[key] !== undefined) {
        flag(`taskScheduler.${key} is retired and nothing reads it`,
          'delete it: a task cadence measures whole UTC periods, and the scheduler workflow\'s own cron hours were written in when the file was scaffolded');
      }
    }

    const entries = Array.isArray(raw.packs) ? raw.packs : [];
    const idOf = (e) => (typeof e === 'string' ? e : (e && typeof e === 'object' && typeof e.id === 'string' ? e.id : null));
    const renames = renamedPacks.RENAMED_PACKS ?? {};

    for (const entry of entries) {
      const id = idOf(entry);
      if (id === null) continue;
      if (Object.hasOwn(renames, id)) {
        flag(`the pack entry "${id}" names a pack that has been renamed or absorbed`,
          `declare "${renames[id]}" instead — an id is matched literally when packs activate, so on the day the rename map comes out this entry activates nothing at all, the self-refresh included`);
      }
      if (typeof versionSpec.isLegacyVersion === 'function' && versionSpec.isLegacyVersion(entry?.version)) {
        flag(`the pack entry "${id}" is stamped with the pre-2026-08-20 integer version ${entry.version}`,
          'let the converge restamp it — a date-anchored `<day>.<n>` says when, where a counter says only "behind by an unknown amount"; if the converge has run and the integer is still here, this mount is not converging');
      }
    }

    if (typeof versionSpec.isLegacyVersion === 'function' && versionSpec.isLegacyVersion(raw.engineVersion)) {
      flag(`engineVersion is the pre-2026-08-20 integer ${raw.engineVersion}`,
        'let the converge restamp it — an integer sorts below every date-anchored version, so this mount prices itself as ancient against all of them');
    }

    // A literal, not a read of the engine: `updates` left the vocabulary with #1643,
    // so there is no constant left to name it — and the member file that still says
    // it is exactly what this rule exists to find. The value is historical and
    // cannot move.
    if (raw.servedBy?.mechanism === 'updates') {
      flag('servedBy.mechanism is the retired alias "updates"',
        `write "${servedBy.VERSIONED_MECHANISM ?? 'versioned'}" — the alias left the vocabulary, so this declaration now reads as unrecognised; the update flows still run here, from the default rather than from anything this repo said`);
    }

    return out;
  },
};

export default rule;
