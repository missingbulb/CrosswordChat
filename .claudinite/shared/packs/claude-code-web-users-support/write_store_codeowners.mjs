// Regenerate the store's CODEOWNERS block (store_codeowners.mjs) from the tracked person
// directories. Run it in the store repo, in the change that adds or renames a directory.

import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { loadConfig } from '../../engine/checks/helpers/repo-context.mjs';
import { resolveStore } from './user_pack_address.mjs';
import { CODEOWNERS_FILE, codeownersBlock, withBlock } from './store_codeowners.mjs';

function main() {
  const root = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const store = resolveStore(loadConfig(root).packConfig?.['claude-code-web-users-support'] ?? null);
  if (!store) throw new Error('this repo declares no usable claude-code-web-users-support store ("config": { "repo": … })');
  const listed = spawnSync('git', ['ls-files', '--', `${store.path}/`], { cwd: root, encoding: 'utf8' });
  if (listed.status !== 0) throw new Error(`git ls-files failed: ${listed.stderr.trim()}`);
  const target = join(root, CODEOWNERS_FILE);
  const before = existsSync(target) ? readFileSync(target, 'utf8') : '';
  const after = withBlock(before, codeownersBlock(store, listed.stdout.split('\n').filter(Boolean)));
  if (after === before) return;
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, after);
}

Promise.resolve().then(main).catch((e) => {
  process.stderr.write(`write_store_codeowners: ${e.message}\n`);
  process.exitCode = 1;
});
