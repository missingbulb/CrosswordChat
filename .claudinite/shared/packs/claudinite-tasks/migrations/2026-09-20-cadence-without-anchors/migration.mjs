// The per-repo scheduling anchor is retired (#1995), so a member's own declaration
// stops carrying it and its task files state their cadence in the current spelling.
//
// WHAT CHANGED. `taskScheduler.dailyHour`, `weeklyDay` and `monthlyDay` moved a repo's
// cadence boundaries off the UTC calendar and picked the scheduler workflow's two cron
// hours. Both jobs are gone: a cadence term now measures whole UTC periods, and the
// cron's minute and hours are derived from the repo name and written once when the
// workflow is scaffolded. The knob's stated purpose was to order members an hour ahead
// of the canon, and this repo's own record showed Actions firing up to 78 minutes off
// schedule across a single week, wider than the stagger it was meant to guarantee.
//
// TWO REWRITES, both over files the MEMBER owns. The three keys come out of
// `.claudinite-settings.json`, and every
// `.claudinite/local/packs/<pack>/tasks/<name>/task.json` has its `due:<cadence>`
// restated as `schedule:at-most-<cadence>`, as anchored text so the file's own layout
// survives. The engine reads the old spelling permanently
// (packs/claudinite-tasks/calendar.mjs, DUE_TERM), so that second rewrite repairs
// nothing: it is what stops the fleet carrying two spellings of one term forever.
//
// GATED ON THE MOUNT, BY CONTENT. Dropping the keys is safe on an older engine, whose
// reader fills an absent key with the documented default that every repo which never
// moved its anchor was already using. Restating the terms is not: an engine that does
// not know `schedule:at-most-` reads it as an unknown condition and fails the run. So
// `appliesTo` probes the mounted calendar for the term rather than trusting the stamp,
// and an unreadable mount reads as "not capable" and leaves the record inert. The
// canon runs the same probe against its own tree (two-root form).
//
// AN APPLY STAGE, because the second rewrite changes a shape the member's own tests
// may assert on. The text is the easy half; the half no codemod reaches is the
// member's suite, which lives in a repo this one has never seen. The last record to
// rewrite these files said a session had nothing to add and landed red on a member
// that had five tests pinning the old shape.
const CALENDAR = 'packs/claudinite-tasks/src/contract/calendar.mjs';
const twoRoot = async (read, file) => (await read(`.claudinite/shared/${file}`)) ?? (await read(file));
const mountStatesPeriods = async (read) => {
  const calendar = await twoRoot(read, CALENDAR);
  return Boolean(calendar) && calendar.includes('AT_MOST_PREFIX');
};

export default {
  id: 'cadence-without-anchors',
  landed: '2026-09-20',
  // The version is cut on main after the merge, so a record cannot name it exactly:
  // this is the next number the bump would cut for the pack at 60920.3, above every
  // member's installed version, so the gap holds the record, and never above the number
  // cut, so a converged member does not re-apply it. RE-CHECK IT AGAINST `pack.mjs` ON
  // EVERY REBASE: main cuts versions while a branch waits, and a record that falls at or
  // below the installed version is silently already done. It has happened once on this
  // branch already, main cutting 60920.3 while it sat.
  version: '60920.4',
  summary: 'the retired taskScheduler anchor keys come out of a member\'s declaration, and its own task files restate `due:<cadence>` as `schedule:at-most-<cadence>` (#1995)',

  appliesTo: mountStatesPeriods,
  dropSchedulerSettings: ['dailyHour', 'weeklyDay', 'monthlyDay'],
  updateTaskSchedulingFields: true,

  applyStage: {
    why: 'the cadence term\'s new spelling meets whatever this repo\'s own tests pin about it',
    instructions: [
      'The deterministic half has already run: the retired `taskScheduler` anchor keys',
      'are out of `.claudinite-settings.json`, and every `due:<cadence>` under',
      '`.claudinite/local/packs/*/tasks/*/task.json` now reads `schedule:at-most-<cadence>`.',
      '',
      'Run this repo\'s own test suite and repair whatever asserted on the old shape.',
      'What breaks is a test that pins the literal string: a `preconditions` array',
      'compared with `deepEqual`, a regex over a task declaration, a fixture that spells',
      'a cadence out. Update it to the current spelling. Nothing about WHEN the task',
      'runs has changed for it, so a test whose subject is the behaviour rather than',
      'the wording needs no edit.',
      '',
      'Two things to leave alone. `due:<cadence>` still works everywhere and is read',
      'permanently, so a mention of it in prose is not wrong and does not need hunting',
      'down. And anything under `.claudinite/shared/` is the vendored mount: it is',
      'replaced wholesale by the update flows and is never edited in a member.',
      '',
      'A repo whose tests say nothing about a cadence term needs nothing here, and that',
      'is the common case: converge to a no-op rather than inventing an edit.',
    ].join('\n'),
  },

  // The telemetry hook cannot list directories, so the local-pack half is invisible to
  // it; the declaration half is what `legacy-shape-in-use` reports in each holder's own
  // repo, and #2181 takes the keys off the accepted list once that advisory has had its
  // convergence window.
  legacyPresent: async () => false,
};
