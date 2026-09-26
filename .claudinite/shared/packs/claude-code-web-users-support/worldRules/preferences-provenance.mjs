import { finding } from '../../../engine/checks/helpers/findings.mjs';
import { resolveStore, isUsableIdentity } from '../user_pack_address.mjs';
// A namespace import, guarded in `run`: the pack and engine lanes deliver on separate
// cadences, and a member whose engine predates the helper must load this pack rather
// than fault on a missing named export.
import * as provenance from '../../../engine/checks/helpers/provenance.mjs';

// A person's pack is a pack (the provenance design, #2136): each rule in it is an element,
// and its file sits where every other pack keeps them, in the pack's own `provenance/`.
// This check asserts existence only - every rule bullet ends with a marker naming a file
// under that folder - and shares no logic with the growth pack beyond the engine's own
// bullet reader: the grammar of the file is judged by the growth tool's `check`, run by the
// session that edits the rule.
//
// ADVISORY, like everything in this pack: the loss is a missing why for a rule, never a
// broken repo. RELEVANCE-FIRST like its siblings: inert unless this repo IS the store -
// only the one repo that holds `<path>/<login>/` packs has anything to judge.
const PACK = 'claude-code-web-users-support';

// @deprecated The sidecar folder a person's provenance sat in while the store was flat and
// could hold nothing but `<email>.md`. Nothing here calls it and no layout has it any more; it
// stays only because a member's own local pack may have imported it, and the pack and engine
// lanes deliver on separate cadences.
// @legacy-tolerance advisory:none retire:#2188
export const provenanceDirOf = (store) => `${store.path}-provenance`;


const rule = {
  id: 'preferences-provenance',
  on_fail: 'advise',
  description: 'Every rule in a personal pack this repo stores ends with a marker naming its provenance file in that pack',
  doc: 'packs/claude-code-web-users-support/RULES.md',
  why: 'a rule with no file has no record of when it was set or what prompted it, and the session that changes it next is the only reader who could have written that down',

  run(ctx) {
    if (typeof provenance.ruleBlocks !== 'function') return []; // an engine that predates the helper
    const { ruleBlocks } = provenance;
    const store = resolveStore(ctx.config.packConfig?.[PACK] ?? null);
    if (!store) return [];
    const prefix = `${store.path}/`;
    // One prose file per person, at the pack's own `RULES.md` - the only file in a person's
    // directory this check has anything to say about.
    const held = (ctx.files ?? []).filter((f) => {
      const rest = f.startsWith(prefix) ? f.slice(prefix.length) : null;
      return rest !== null && rest.endsWith('/RULES.md') && rest.split('/').length === 2;
    });
    if (!held.length) return [];
    const out = [];
    for (const file of held) {
      const email = file.slice(prefix.length, -'/RULES.md'.length);
      if (!isUsableIdentity(email)) continue; // store-file-names reports the name
      const dir = `${prefix}${email}/provenance`;
      for (const b of ruleBlocks(ctx.read(file) ?? '')) {
        if (!b.slug) {
          out.push(finding(rule, {
            file, line: b.start + 1,
            what: `the rule "${b.trigger}" ends with no marker naming its provenance file`,
            fix: `end it with a slug marker, e.g. (${b.trigger.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').split('-').slice(0, 3).join('-')}), and write that file under ${dir}/ with a born entry saying when the rule was set and what prompted it`,
          }));
        } else if (!ctx.exists(`${dir}/${b.slug}.md`)) {
          out.push(finding(rule, {
            file, line: b.lastLine + 1,
            what: `the rule "${b.trigger}" names ${dir}/${b.slug}.md, which does not exist`,
            fix: `create ${dir}/${b.slug}.md with a born entry, or fix the marker to the file it meant`,
          }));
        }
      }
    }
    return out;
  },
};

export default rule;
