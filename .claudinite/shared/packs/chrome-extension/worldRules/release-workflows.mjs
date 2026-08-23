import { finding } from '../../../engine/checks/helpers/findings.mjs';
import { migrationActive } from '../../../engine/checks/helpers/active-migrations.mjs';

// The Chrome-Web-Store release pipeline is VENDORED into each consumer's own
// .github/: the orchestrator (this STUB_FILE, named "Release to Chrome Store")
// owns the triggers and calls three LOCAL reusable workflows, which — with the
// privacy-page reusable and three composite actions — the pack materializes
// alongside it. Nothing references Claudinite's core .github/ any more; the whole
// set runs inside the repo. The pack keeps the copies in sync (baselining
// re-materializes on drift), so a consumer hosts the pipeline without owning it.
//
// The rename that made vendoring possible: the create-package reusable was
// `chrome-extension-release.yml` in the canon, which would collide with the
// orchestrator's own filename inside one repo, so it's vendored as
// `chrome-extension-create-package.yml`. STUB_FILE (the orchestrator) keeps its
// name — that's the fingerprint DESIGN.md pins the conformance suite to, and the
// failure-reporter issue keys ("Release: Create Package", …) live in the vendored
// reusables. The daily schedule is contract too: STUB_CRON pins every repo's
// nightly release to the same anchor. The privacy page has no orchestrator entry of
// its own: it redeploys as part of every publish (the publish reusable's
// deploy-privacy-page leg).
//
// Migration tolerance: while `chrome-release-vendoring` is recent, a repo still
// on the pre-vendoring shape (the orchestrator calling Claudinite's core
// workflows @main) is TOLERATED — baselining vendors it, no red window. Once the
// record ages out of the recency window, migrationActive() flips false and the
// tolerance is gone: every up-to-date repo has vendored by then, and a repo
// still on @main is flagged.
export const STUB_FILE = 'chrome-extension-release.yml';
export const STUB_NAME = 'Release to Chrome Store';
export const LEGACY_STUB_NAMES = ['Release'];
export const STUB_CRON = '30 0 * * *';

// The create-package reusable's canon filename (pre-vendoring), still the name a
// legacy orchestrator calls @main — kept for the fingerprint + tolerance.
export const LEGACY_CREATE_PACKAGE = 'chrome-extension-release.yml';
// Its vendored filename (renamed to avoid colliding with the orchestrator).
export const VENDORED_CREATE_PACKAGE = 'chrome-extension-create-package.yml';

// The reusable workflows the orchestrator calls locally.
export const BUMP_CALL = 'chrome-extension-bump-version.yml';
export const ORCHESTRATOR_CALLS = [
  VENDORED_CREATE_PACKAGE,
  'chrome-extension-publish-store.yml',
  'chrome-extension-daily-release.yml',
  BUMP_CALL,
];
// Every reusable workflow that must be vendored under .github/workflows/ (the
// three the orchestrator calls, plus the privacy-page reusable the publish one
// calls).
export const VENDORED_WORKFLOWS = [...ORCHESTRATOR_CALLS, 'deploy-privacy-page.yml'];
// Every composite action that must be vendored under .github/actions/<name>/.
export const VENDORED_ACTIONS = ['read-release-config', 'bump-extension-patch', 'report-failure'];

export const VENDORING_MIGRATION = 'chrome-release-vendoring';

// DOES THIS REPO SHIP TO THE STORE? The whole release half of this pack is gated on
// it, coded rule and declared checks alike — coding an extension pulls the pack in
// (its fingerprint is the manifest), and a repo that never publishes must not be
// asked for a release config, a privacy page or a README release section.
//
// TWO SIGNALS, EITHER ONE ENOUGH, because each alone leaves the rule that judges it
// unreachable: gate only on the orchestrator's name and a repo that renamed it loses
// every release check silently — including the one that says to rename it back —
// and gate only on `.github/release.config` and the check that requires that file
// can never fire. Together each is the other's backstop.
//
// The orchestrator is matched by NAME, never by path: Claudinite's own core tree
// carries files at those paths named "… (reusable)", so a path test would make the
// canon fingerprint itself. The legacy pre-rename name still counts — a repo on it is
// shipping, and cer/release-workflows is what tells it to rename (#1057; the name
// test was this pack's `detect` before the collapse).
//
// DUPLICATED, DELIBERATELY: the declared checks in declared-checks.json cannot
// import, so each carries the same two signals as one `relevantWhen`
// `someTrackedFileContains` — a path union and a text union, which is how that
// vocabulary spells "either file says so". A drift guard runs the JSON gate and this
// function over one matrix of repos and fails if they ever disagree, so keep both
// literals unbroken.
export const SHIPS_PIPELINE_PATH_RE = /^\.github\/(?:workflows\/[^/]+\.ya?ml|release\.config)$/;
export const SHIPS_PIPELINE_TEXT_RE = /^(?:name:\s*['"]?(?:Release to Chrome Store|Release)['"]?\s*|manifest_path=.*)$/m;

export function shipsReleasePipeline(ctx) {
  return ctx.tracked.some((f) => SHIPS_PIPELINE_PATH_RE.test(f) && SHIPS_PIPELINE_TEXT_RE.test(ctx.read(f) ?? ''));
}

// A repo is on the pre-vendoring shape when its orchestrator still calls one of
// Claudinite's core release workflows @main.
const LEGACY_CANON_REF = /missingbulb\/Claudinite\/\.github\/workflows\/chrome-extension-[a-z-]+\.yml@/;

const rule = {
  id: 'cer/release-workflows',
  severity: 'blocking',
  description: 'The orchestrator (chrome-extension-release.yml, named "Release to Chrome Store", daily at the contract cron) and the reusable workflows + composite actions it calls must be vendored into .github/',
  doc: 'packs/chrome-extension/skills/chrome-store-releases/SKILL.md',
  why: 'every extension repo ships the same pipeline entirely from its own .github/ — vendored from the pack, kept in sync by baselining, with no cross-repo @main dependency',

  // opts.tolerateLegacy defaults to whether the vendoring migration is still live;
  // tests pass it explicitly to exercise the in-flight and retired states.
  run(ctx, { tolerateLegacy = migrationActive(VENDORING_MIGRATION) } = {}) {
    // RELEVANCE FIRST: a repo that codes an extension but does not publish one
    // ships no pipeline and is asked for nothing here.
    if (!shipsReleasePipeline(ctx)) return [];

    const path = `.github/workflows/${STUB_FILE}`;
    const text = ctx.read(path);
    if (text === null) {
      // Shipping (some workflow carries the orchestrator's name) but not from the
      // contract's path — the set cannot be kept in sync where it is.
      return [finding(rule, {
        file: path,
        what: `${STUB_FILE} is missing`,
        fix: 'copy the vendored release set from this pack (stubs/workflows/ + stubs/actions/); the orchestrator is stubs/workflows/chrome-extension-release.yml',
      })];
    }

    const out = [];
    const name = /^name:\s*['"]?(.+?)['"]?\s*$/m.exec(text)?.[1];
    if (name !== STUB_NAME) {
      out.push(finding(rule, {
        file: path,
        what: `name: is "${name ?? '(none)'}" — the contract requires "${STUB_NAME}"`,
        fix: `set "name: ${STUB_NAME}"`,
      }));
    }

    // The orchestrator's own cron is a cutover flip. Before a repo adopts the
    // per-repo scheduler, the orchestrator IS the release schedule and must carry the
    // contract cron. Once the vendored claudinite-scheduler.yml is present, the
    // store-release task drives the daily release (per-project-scheduling §6) and the
    // scheduler is the repo's only cron — so the orchestrator must be dispatch-only,
    // no `schedule:` at all. Gating on the scheduler's presence makes the flip travel
    // WITH the de-cron'd stub into a repo's mount, never before it.
    const cutOver = ctx.read('.github/workflows/claudinite-scheduler.yml') !== null;
    const cron = /^\s*-\s*cron:\s*['"]?([^'"\n]+?)['"]?\s*$/m.exec(text)?.[1];
    if (cutOver) {
      if (cron !== undefined) {
        out.push(finding(rule, {
          file: path,
          what: `has a schedule cron "${cron}", but this repo runs the Claudinite scheduler — the store-release task drives the daily release, so the orchestrator must be dispatch-only`,
          fix: 'remove the schedule: trigger from the orchestrator (keep push + workflow_dispatch); the store-release task fires the daily release',
        }));
      }
    } else if (cron !== STUB_CRON) {
      out.push(finding(rule, {
        file: path,
        what: `schedule cron is ${cron ? `"${cron}"` : '(none)'} — the contract requires "${STUB_CRON}"`,
        fix: `set the schedule trigger to - cron: "${STUB_CRON}" (or re-copy the orchestrator from the pack's stubs/workflows/)`,
      }));
    }

    // Pre-vendoring shape: the orchestrator still calls Claudinite core @main.
    if (LEGACY_CANON_REF.test(text)) {
      if (tolerateLegacy) return out; // rollout in flight — baselining vendors it
      out.push(finding(rule, {
        file: path,
        what: 'still calls Claudinite\'s core release workflows @main, which the vendoring has retired',
        fix: 'vendor the pack\'s stubs/workflows/ + stubs/actions/ into this repo\'s .github/ and repoint the three uses: to ./.github/workflows/… (baselining does this via the chrome-release-vendoring migration)',
      }));
      return out;
    }

    // Vendored shape: the orchestrator must call the three local reusables.
    for (const call of ORCHESTRATOR_CALLS) {
      if (!text.includes(`./.github/workflows/${call}`)) {
        out.push(finding(rule, {
          file: path,
          what: `does not call the local reusable workflow ./.github/workflows/${call}`,
          fix: `re-copy the orchestrator from the pack (stubs/workflows/${STUB_FILE})`,
        }));
      }
    }
    // …and every vendored reusable workflow + composite action must be present.
    for (const wf of VENDORED_WORKFLOWS) {
      if (ctx.read(`.github/workflows/${wf}`) === null) {
        out.push(finding(rule, {
          file: `.github/workflows/${wf}`,
          what: `vendored reusable workflow ${wf} is missing`,
          fix: `copy it from the chrome-extension pack (stubs/workflows/${wf})`,
        }));
      }
    }
    for (const act of VENDORED_ACTIONS) {
      if (ctx.read(`.github/actions/${act}/action.yml`) === null) {
        out.push(finding(rule, {
          file: `.github/actions/${act}/action.yml`,
          what: `vendored composite action ${act} is missing`,
          fix: `copy it from the chrome-extension pack (stubs/actions/${act}/)`,
        }));
      }
    }
    return out;
  },
};

export default rule;
