// Drop the named operator-hold line from every member's live executor workflow once the
// vars bag carries it.
//
// WHY THE LINE IS DEAD WEIGHT. `hold.mjs` reads the hold out of `CLAUDINITE_VARS` first
// and falls back to the named env copy only where the job has no bag. An executor that
// carries `CLAUDINITE_VARS: ${{ toJSON(vars) }}` therefore never consults the named line:
// both come from the same `vars` context, so the bag always answers. The stubs no longer
// carry it; this record brings members that adopted earlier into line.
//
// ONLY WHERE THE BAG IS PRESENT. A member whose executor never received the bag reads
// the hold through the named line alone, and removing it there would leave the queue
// with no stop. `appliesTo` requires the bag, so such a member keeps its line.
//
// A REWRITE, NOT A MATERIALIZE: each member's executor carries its own stamped
// `required_secrets` beneath the `# claudinite:secrets` marker, and a rewrite preserves
// everything it does not name. Idempotency is the literal itself: once the line is gone
// it no longer occurs, and `appliesTo` reads the destination for the same reason.
//
// A record must be self-contained: it is read on a repo whose mount holds only the
// records that still apply to it, so nothing here imports a sibling record.
const EXECUTOR = '.github/workflows/claudinite-executor.yml';
const HOLD = '          CLAUDINITE_TASKS_SUSPEND_ALL: ${{ vars.CLAUDINITE_TASKS_SUSPEND_ALL }}\n';
const BAG = 'CLAUDINITE_VARS: ${{ toJSON(vars) }}';

const carriesRedundantHold = async (read) => {
  const text = await read(EXECUTOR);
  return Boolean(text) && text.includes(HOLD) && text.includes(BAG);
};

export default {
  id: 'executor-hold-through-the-bag',
  landed: '2026-09-24',
  version: '60924.1',
  summary: 'the live executor workflow reads the operator hold through its vars bag alone, dropping the named CLAUDINITE_TASKS_SUSPEND_ALL line the bag already carries',

  appliesTo: carriesRedundantHold,
  rewrite: [{ file: EXECUTOR, replace: [{ from: HOLD, to: '' }] }],
  legacyPresent: async (_exists, read) => carriesRedundantHold(read),
};
