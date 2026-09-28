// The usage review's findings and its dashboard values move into `.claudinite/usage/`
// (#2322). Both roll forward from one review to the next (`since`, `previous`), so
// each is renamed whole, bytes unchanged, only where the new path does not exist yet,
// and never removed otherwise. The review also moves a file this record missed, on
// its next run.
//
// THE VERSION IS PAST THE LANDING DAY on purpose - see the provenance-marking record
// beside this one for why a pack record cannot know the version it takes effect at.
export default {
  id: 'rolling-review-files',
  landed: '2026-09-25',
  version: '61002.1',
  summary: 'usage-review.GENERATED.json and the growth dashboard values move into .claudinite/usage/',

  aliases: [
    { canonical: '.claudinite/usage/element-review-findings.json', legacy: ['.claudinite/local/usage-review.GENERATED.json'] },
    { canonical: '.claudinite/usage/claudinite-growth-dashboard-values.json', legacy: ['.claudinite/local/dashboard/claudinite-growth.GENERATED.json'] },
  ],
  legacyPresent: async (exists) => (await exists('.claudinite/local/usage-review.GENERATED.json'))
    || exists('.claudinite/local/dashboard/claudinite-growth.GENERATED.json'),
};
