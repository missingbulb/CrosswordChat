// The declaration half of the chrome-extension-release collapse (#1057): the pack
// stopped existing and its content moved into chrome-extension, whose release rules
// now gate on the repo shipping the pipeline rather than on a second declaration.
//
// NOTHING DEPENDS ON THIS HAVING RUN. `RENAMED_PACKS` resolves the absorbed id to
// chrome-extension, so a member activates the right pack the moment the mount lands,
// declaration converged or not. What this buys is the day that map entry can be
// retired — and a declaration that stops naming a pack nobody can look up.
//
// Structural, and the ids come from the engine's rename map rather than from this
// record — see applyPackRenames in engine/migrations/registry.mjs. Every member
// carrying the absorbed pack carries chrome-extension too (it was its `requires`),
// so the rewrite collides on every one of them; the merge there is what keeps that
// member's own config, severities and acceptances.
export default {
  id: 'chrome-release-collapse',
  landed: '2026-08-19',
  version: 3,
  summary: 'chrome-extension-release collapsed into chrome-extension; the declaration converges onto the surviving id (#1057)',

  renameDeclaredPacks: true,
};
