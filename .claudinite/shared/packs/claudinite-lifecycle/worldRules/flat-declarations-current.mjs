import { isDeepStrictEqual } from 'node:util';
import { finding } from '../../../engine/checks/helpers/findings.mjs';
import { packEntryId } from '../../../engine/pack_loader/pack-registry.mjs';
// A namespace read: the flat directory's writer is newer than engines this pack lands
// beside, and a named import of an absent export faults the whole pack at link time.
import * as rulesIndex from '../../../engine/pack_loader/generate-rules-index.mjs';

// The sibling of the two index checks for the flat declarations: every declared pack's
// task.json and dashboard.json, copied into `.claudinite/flat/` by the converge. A task
// edited, added or removed since the last converge leaves a file that answers "what
// runs here" wrongly, and the dashboard reading a member reads only that file. Asked
// from the repo's own files, as the index checks are (a rule cannot await the
// generator): does each file name exactly the sources a declared pack holds here, each
// with the content it holds now.
const FLAT_DIR = '.claudinite/flat';
const SOURCES = [
  { file: `${FLAT_DIR}/tasks.GENERATED.json`, key: 'tasks', match: /^tasks\/([^/]+)\/task\.json$/, name: (pack, m) => `${pack}/${m[1]}` },
  { file: `${FLAT_DIR}/dashboard.GENERATED.json`, key: 'dashboards', match: /^dashboard\.json$/, name: (pack) => pack },
];

const parsed = (text) => {
  try { return { declaration: JSON.parse(text) }; } catch { return { text }; }
};

const rule = {
  id: 'flat-declarations-current',
  on_fail: 'block',
  description: 'The flat task and dashboard files name every declared pack\'s task.json and dashboard.json, each as it reads now',
  doc: 'engine/pack_loader/generate-flat-declarations.mjs',
  why: 'the dashboard and a session asking what runs here read the flat files alone - a stale one shows a task that is gone, hides one that runs, or shows a declaration its source no longer says',

  run(ctx) {
    // An engine that still writes the index outside the flat directory writes no flat
    // declarations either, so there is nothing yet to demand.
    if (typeof rulesIndex.RULES_INDEX_FILE !== 'string' || !rulesIndex.RULES_INDEX_FILE.split(/[\\/]/).includes('flat')) return [];

    const declared = Array.isArray(ctx.config?.packs) ? ctx.config.packs : [];
    const held = SOURCES.map(() => new Map());
    for (const entry of declared) {
      const id = packEntryId(entry);
      if (!id) continue;
      // The loaded declaration carries a local pack's bare id, so where its files sit
      // is what says it is local, and the flat file spells it as the declaration does.
      const localRoot = `.claudinite/local/packs/${id}/`;
      const roots = [`.claudinite/shared/packs/${id}/`, `packs/${id}/`, localRoot];
      for (const path of ctx.tracked) {
        const root = roots.find((r) => path.startsWith(r));
        if (!root) continue;
        const name = root === localRoot ? `local/${id}` : id;
        SOURCES.forEach((source, i) => {
          const m = source.match.exec(path.slice(root.length));
          if (m) held[i].set(source.name(name, m), path);
        });
      }
    }

    const regenerate = 'run `node .claudinite/shared/engine/pack_loader/generate-flat-declarations.mjs --write` (canon-side: `node engine/pack_loader/generate-flat-declarations.mjs --write`) and commit the result';
    const out = [];
    SOURCES.forEach((source, i) => {
      if (!held[i].size) return;
      const flag = (what) => out.push(finding(rule, { file: source.file, what, fix: regenerate }));
      let flat;
      try { flat = JSON.parse(ctx.read(source.file) ?? 'null')?.[source.key]; } catch { flat = undefined; }
      if (!flat || typeof flat !== 'object') {
        flag(`${source.file} is missing or unreadable`);
        return;
      }
      // Every declared pack's source must be there. A subset test, as rules-index-current
      // makes: the `requires` closure activates packs the declaration never names, so
      // an entry beyond the declared set is judged by its own source file instead.
      for (const [name, path] of held[i]) {
        if (!flat[name]) flag(`${path} is not in ${source.file}`);
      }
      for (const [name, have] of Object.entries(flat)) {
        if (typeof have?.path !== 'string' || !ctx.exists(have.path)) {
          flag(`${source.file} names "${name}" at ${have?.path}, which is not a file here`);
          continue;
        }
        const want = parsed(ctx.read(have.path) ?? '');
        if (!isDeepStrictEqual(have.declaration ?? have.text, want.declaration ?? want.text)) {
          flag(`${source.file} carries a copy of ${have.path} that no longer matches it`);
        }
      }
    });
    return out;
  },
};

export default rule;
