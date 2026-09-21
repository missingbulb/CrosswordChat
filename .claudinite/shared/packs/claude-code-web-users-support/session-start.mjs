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

// What the pack costs the session, on the engine's facet channel
// (engine/pack_loader/run-pack-session-start.mjs) so the opening summary can state it in the
// unit it states the rest of the load in. This step is the only thing in the session that can
// weigh it: what it weighs came from another repository.
//
// Words at the standard English ratio, the same estimate the summary line makes of the corpus
// prose: a character count is thrown off by exactly what these files are full of,
// punctuation-dense Markdown. Rounded to 10 where the corpus rounds to 500, because this is
// hundreds of tokens against its tens of thousands.
const words = prose.trim().split(/\s+/).filter(Boolean).length;
const tokens = Math.round(words / 0.75 / 10) * 10;
if (tokens) process.stdout.write(`CLAUDINITE-FACET: ${tokens.toLocaleString('en-US')} personal pack tokens\n`);
process.exit(0);
