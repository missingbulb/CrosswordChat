// This pack's session-start step: say what the person's pack cost, or why they have none.
//
// THE COPY ITSELF IS session-prepare.mjs, which runs in the phase before the skill mount and
// the self-test, because what it writes is a pack those steps have to see. By the time this
// step runs, the person's rules are already in the session on the memory channel (the rules
// index imports the copied pack's prose) and their skills are already mounted. What is left
// is the part only a reader needs.
//
// SO IT EMITS NO RULES. Prose on this channel is prose the harness may truncate on the way in,
// with nothing on either side able to tell (#807), which is exactly why the pack rides the
// memory channel instead. A step that also printed the rules would spend the session's context
// twice for one set of them.
//
// AND IT READS NO STATUS FILE. The directory is the answer: the placeholder means nothing
// landed, and why is a pure function of the config and the environment.

import { existsSync, readFileSync } from 'node:fs';
import { PLACEHOLDER, proseIn } from './copy_user_pack_to_repo.mjs';
import { resolveStore, declineReason } from './user_pack_address.mjs';

const note = (s) => { process.stdout.write(`PERSONAL PACK: ${s} - proceeding with default interaction behavior.\n`); process.exit(0); };

const root = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const config = (() => {
  try { return JSON.parse(process.env.CLAUDINITE_PACK_CONFIG || '{}'); } catch { return {}; }
})();

const prose = existsSync(proseIn(root)) ? readFileSync(proseIn(root), 'utf8') : null;

// No file at all means the prepare phase never ran: an engine older than the phase, which a
// member holds until the engine lane catches up with the pack lane. Nothing to report about
// this person, and nothing this step can do about it from here.
if (prose === null) {
  note('this repo\'s engine has no session-prepare phase, so no personal pack was copied in');
}

if (prose === PLACEHOLDER) {
  const why = declineReason(config, process.env)
    ?? `${resolveStore(config).repo} holds no pack for this person, or it could not be read`;
  note(why);
}

// AND IT WEIGHS NOTHING. The copy is on disk before the summary step runs, off the same
// registry the summary reads every other pack from, so the summary counts this pack with the
// rest and one number covers the whole load. A figure emitted here would be that same prose
// stated twice under two names, and a reader holding only the corpus figure would be told a
// corpus smaller than the one they have.
process.exit(0);
