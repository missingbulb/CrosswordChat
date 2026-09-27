import { finding } from '../../../engine/checks/helpers/findings.mjs';
import { resolveStore } from '../user_pack_address.mjs';
import { CODEOWNERS_FILE, codeownersBlock, readBlock } from '../store_codeowners.mjs';

// The store's CODEOWNERS carries the block its directories derive, and nothing after it
// re-owns them. Advisory: a directory missing its line falls to the admin's `/<path>/` line,
// so drift fails safe. Inert unless this repo holds the store its declaration names.
const PACK = 'claude-code-web-users-support';
const WRITER = 'node .claudinite/shared/packs/claude-code-web-users-support/write_store_codeowners.mjs';

const rule = {
  id: 'preferences-store-codeowners',
  on_fail: 'advise',
  description: 'A personal-pack store this repo holds carries the CODEOWNERS block its person directories derive',
  doc: 'packs/claude-code-web-users-support/README.md',
  why: 'a person trusts that nobody but them or the admin edited their pack only while their directory has its code-owner line',

  run(ctx) {
    const store = resolveStore(ctx.config.packConfig?.[PACK] ?? null);
    const files = ctx.files ?? [];
    if (!store || !files.some((f) => f.startsWith(`${store.path}/`))) return [];

    const fix = `run \`${WRITER}\` and commit ${CODEOWNERS_FILE}`;
    const found = readBlock(files.includes(CODEOWNERS_FILE) ? ctx.read(CODEOWNERS_FILE) ?? '' : '');
    if (!found) return [finding(rule, { file: CODEOWNERS_FILE, what: `carries no generated block for ${store.path}/`, fix })];

    const expected = codeownersBlock(store, files);
    const out = [];
    if (found.block !== expected) {
      const have = new Set(found.block.split('\n'));
      const missing = expected.split('\n').filter((l) => !have.has(l) && !l.startsWith('#'));
      out.push(finding(rule, {
        file: CODEOWNERS_FILE,
        what: `its generated block is out of step with ${store.path}/${missing.length ? ` - missing ${missing.join(', ')}` : ''}`,
        fix,
      }));
    }
    if (found.ownerLinesAfter.length) {
      out.push(finding(rule, {
        file: CODEOWNERS_FILE,
        what: `has owner lines after the generated block (${found.ownerLinesAfter.join(', ')}), and GitHub's last matching line wins`,
        fix: `move those lines above the block, or remove them if they re-own ${store.path}/`,
      }));
    }
    return out;
  },
};

export default rule;
