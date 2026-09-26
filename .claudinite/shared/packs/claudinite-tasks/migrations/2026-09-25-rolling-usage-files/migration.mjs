// The two folds' files move into `.claudinite/usage/`, named for what they track
// (#2322). They are ROLLING: each fold starts from the last, so a lost copy is lost
// history. The alias renames each file whole, bytes unchanged, only where the new path
// does not exist yet, and never removes a file otherwise. That lands every member's
// move in the one converge this pack version reaches it in; the fold itself also
// moves a file this record missed, on its next run.
//
// THE VERSION IS PAST THE LANDING DAY on purpose: the pack-version-bump task cuts the
// version after the change lands, so the record cannot know it, and a value past the
// landing day keeps it in range for the first converge after the pack update reaches a
// member. Every application after that is the alias finding nothing to move.
export default {
  id: 'rolling-usage-files',
  landed: '2026-09-25',
  version: '61002.1',
  summary: 'usage.GENERATED.json and tasks-usage.GENERATED.json move into .claudinite/usage/ as sessions-and-elements.json and task-runs-and-costs.json',

  aliases: [
    { canonical: '.claudinite/usage/sessions-and-elements.json', legacy: ['.claudinite/local/usage.GENERATED.json'] },
    { canonical: '.claudinite/usage/task-runs-and-costs.json', legacy: ['.claudinite/local/tasks-usage.GENERATED.json'] },
  ],
  legacyPresent: async (exists) => (await exists('.claudinite/local/usage.GENERATED.json'))
    || exists('.claudinite/local/tasks-usage.GENERATED.json'),
};
