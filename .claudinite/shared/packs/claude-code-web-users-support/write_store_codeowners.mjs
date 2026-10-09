// Regenerate the store's CODEOWNERS block (store_codeowners.mjs) from the tracked person
// directories. Run it in the store repo, in the change that adds or renames a directory.
//
// The store's address is this pack's entry config, read through the repo's own engine
// (`cn settings config`, the binary CLAUDINITE_CN names, else the pinned
// `.claudinite/bin/cn`), so the script imports nothing of the engine.

import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { CODEOWNERS_FILE, codeownersBlock, resolveStore, withBlock } from './store_codeowners.mjs';

const PACK = 'claude-code-web-users-support';

function packConfig(root) {
  const cn = process.env.CLAUDINITE_CN || join(root, '.claudinite', 'bin', 'cn');
  const r = spawnSync(cn, ['settings', 'config', PACK, '--repo', root], { encoding: 'utf8' });
  if (r.error) throw new Error(`could not run ${cn}: ${r.error.message}`);
  if (r.status !== 0) throw new Error((r.stderr || `cn settings config exited ${r.status}`).trim());
  return JSON.parse(r.stdout);
}

function main() {
  const root = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const store = resolveStore(packConfig(root));
  if (!store) throw new Error(`this repo declares no usable ${PACK} store ("config": { "repo": … })`);
  const listed = spawnSync('git', ['ls-files', '--', `${store.path}/`], { cwd: root, encoding: 'utf8' });
  if (listed.status !== 0) throw new Error(`git ls-files failed: ${listed.stderr.trim()}`);
  const target = join(root, CODEOWNERS_FILE);
  const before = existsSync(target) ? readFileSync(target, 'utf8') : '';
  const after = withBlock(before, codeownersBlock(store, listed.stdout.split('\n').filter(Boolean)));
  if (after === before) return;
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, after);
}

try {
  main();
} catch (e) {
  process.stderr.write(`write_store_codeowners: ${e.message}\n`);
  process.exitCode = 1;
}
