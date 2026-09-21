// A member's local packs go onto the provenance convention at converge (the
// provenance design, #2136): every pack-root `references.md` converts into
// entries on the elements it keyed, every rule and guideline ends with a marker
// naming its file, every skill declares its body, every carrier has its file. The
// op is the registry's `markProvenance` - a named codemod shipped with the engine
// (engine/checks/helpers/provenance.mjs) - so a member converges onto the convention
// without a session and without anyone remembering; the canon's own shelf is marked
// by hand, in the marking pass this record's pack version follows.
//
// THE VERSION IS PAST THE LANDING DAY on purpose. A pack record names the version its
// change takes effect at, and the pack-version-bump task cuts that number only after
// the change lands - so a record cannot know it. A value past the landing day keeps
// the record in range for the first converge after the pack update reaches a member
// (where the whole work happens), and drops it out of range once the pack next bumps
// past it; every application in between is the codemod finding nothing to do.
//
// legacyPresent: the member carries local packs at all. Which of them are unmarked is
// the codemod's own read, and idempotent either way.
export default {
  id: 'provenance-marking',
  landed: '2026-09-21',
  version: '60930.1',
  summary: 'a member\'s local packs are marked and their references.md converted onto the provenance convention',
  markProvenance: true,
  legacyPresent: async (exists) => exists('.claudinite/local/packs'),
};
