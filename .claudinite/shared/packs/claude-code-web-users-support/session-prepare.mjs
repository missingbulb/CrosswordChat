// This pack's session-prepare step: copy the person's own pack into this repository before
// anything reads the session's pack set.
//
// WHY PREPARE AND NOT START. The skill mount and the self-test read that set before
// session-start.mjs runs. A pack arriving after them is a pack whose skills are not mounted
// and whose absence was never judged, so the copy has to happen in the phase that runs first
// (engine/pack_loader/run-pack-session-start.mjs).
//
// IT SAYS NOTHING HERE. A prepare step's stdout is a diagnostic, not session context; what
// landed is the directory it wrote, plus the login it read, which session-start.mjs reads to
// write the one note a person sees.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { copyUserPackToRepo, loginRecordIn } from './copy_user_pack_to_repo.mjs';
import { readGithubLoginThroughProxy } from './read_github_login.mjs';
import { declineReason } from './user_pack_address.mjs';

const root = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const config = (() => {
  try { return JSON.parse(process.env.CLAUDINITE_PACK_CONFIG || '{}'); } catch { return {}; }
})();

async function main() {
  // No network read for a session that gets no pack whoever it is.
  const identity = declineReason(config, process.env) === null ? await readGithubLoginThroughProxy(process.env) : {};
  try {
    mkdirSync(dirname(loginRecordIn(root)), { recursive: true });
    writeFileSync(loginRecordIn(root), `${JSON.stringify(identity)}\n`);
  } catch { /* the start step then says less */ }
  copyUserPackToRepo({ root, config, env: process.env, login: identity.login ?? null });
}

main().catch((e) => {
  // The one thing worth logging: the store was named and unreachable. Everything else is a
  // state the start step can read for itself.
  process.stderr.write(`could not copy this person's pack: ${e.message}\n`);
}).finally(() => process.exit(0));
