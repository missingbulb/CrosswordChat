// A pack's manifest is data: a member's own local packs move from `pack.mjs` to the
// `pack.json` the loader prefers. The op is the registry's `manifestsToJson`, a named
// codemod over the member's local packs; the vendored mount moves with its own update,
// and a manifest JSON cannot carry stays a module, which the loader still reads.
//
// appliesTo reads the member's mount for the engine that reads `pack.json`: an older one
// discovers no pack in a directory carrying only that file, so a conversion ahead of it
// would drop every local pack at once. An unreadable mount reads as not capable.
const CONVENTIONS = 'engine/pack_loader/pack-conventions.mjs';
const readsPackJson = async (read) => {
  const text = (await read(`.claudinite/shared/${CONVENTIONS}`)) ?? (await read(CONVENTIONS));
  return Boolean(text) && text.includes('MANIFEST_JSON');
};

export default {
  id: 'pack-json-manifests',
  landed: '2026-09-28',
  version: '60928.1',
  summary: 'a local pack\'s `pack.mjs` manifest is rewritten as `pack.json`, where every value it holds is data',
  appliesTo: readsPackJson,
  manifestsToJson: true,
  legacyPresent: async (exists) => exists('.claudinite/local/packs'),
};
