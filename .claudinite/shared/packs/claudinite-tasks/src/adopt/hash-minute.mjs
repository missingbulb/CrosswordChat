// The one vendored place that computes a repo's stable scheduler cron MINUTE
// (docs/PRINCIPLES.md). The per-repo scheduler workflow runs on its own cron
// on a repo-hashed minute constrained to :10–:50 — spreading the fleet across the
// band, dodging GitHub's :00 stampede, and staying clear of the hour boundary the
// anchor arithmetic works from.
//
// This is the minute the stub's placeholder (`cron: '10 * * * *'`) is rewritten to
// when the workflow lands in a repo: bootstrap assigns it, and the update flows'
// self-refresh preserves it (the one repo-specific value in the otherwise-identical
// vendored stub). Deriving it from the full name — not storing it — means any
// session can recompute the canonical value and detect drift.
//
// Self-contained by the engine's module rule: imports nothing, so bootstrap, the
// update runner, and a human can load or run it standalone.

// The inclusive minute band. 41 slots (10..50) — the widest window that clears the
// :00 stampede and the hour boundary on both sides.
export const MINUTE_MIN = 10;
export const MINUTE_MAX = 50;
const BAND = MINUTE_MAX - MINUTE_MIN + 1;

// FNV-1a: deterministic and well-spread; Math.imul keeps the multiply in 32-bit range.
// Keyed on the repo full name ("owner/repo") so the value is stable across re-vendors
// and re-derivable anywhere the name is known.
function hashOf(fullName) {
  let h = 0x811c9dc5;
  const s = String(fullName).toLowerCase();
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function hashedMinute(fullName) {
  return MINUTE_MIN + (hashOf(fullName) % BAND);
}

// THE CRON LINE a repo's scheduler workflow carries, minute and hours both derived
// from the repo's own name. TWO TICKS A DAY (PRINCIPLES.md): the anchor tick, and the
// drain tick twelve hours later for the work that has no period of its own, adopting a
// marked issue, releasing a `Not-before:`, reclaiming a dead claim.
//
// THE HOUR IS HASHED, NOT CONFIGURED (#1995). Actions fires up to 78 minutes off
// schedule, so a configured hour cannot guarantee members run ahead of the canon;
// hashing spreads the fleet across the clock, which is all a configured stagger
// reliably achieved.
//
// Hours 0 through 11 for the anchor, so the drain always lands on a different hour of
// the same day. Shifted off the minute's own bits so two repos sharing a minute rarely
// share an hour.
const ANCHOR_HOURS = 12;
export const hashedHours = (fullName) => {
  const anchor = (hashOf(fullName) >>> 8) % ANCHOR_HOURS;
  return { anchor, drain: anchor + ANCHOR_HOURS };
};

// WRITTEN ONCE, AT SCAFFOLD. The update preserves whatever cron a repo's workflow
// already carries, because `.github/workflows/` lands only
// through a pull request a person merges: restamping it would put every member's
// scheduler behind a human gate every time this derivation changed.
export const hashedCron = (fullName) => {
  const { anchor, drain } = hashedHours(fullName);
  return `${hashedMinute(fullName)} ${anchor},${drain} * * *`;
};

// The shape a scheduler cron must have for the update to keep it: a minute in the
// band, and two hours twelve apart. Anything else is not a cron this repo wrote.
const CRON_RE = /^(\d{1,2}) (\d{1,2}),(\d{1,2}) \* \* \*$/;
export function isSchedulerCron(text) {
  const m = CRON_RE.exec(String(text ?? '').trim());
  if (!m) return false;
  const [minute, anchor, drain] = m.slice(1).map(Number);
  return minute >= MINUTE_MIN && minute <= MINUTE_MAX
    && anchor >= 0 && anchor < ANCHOR_HOURS && drain === anchor + ANCHOR_HOURS;
}

// CLI: `node hash-minute.mjs <owner/repo>` prints the minute (bootstrap / update
// use this to stamp or verify the workflow's cron without re-implementing the hash).
if (import.meta.url === `file://${process.argv[1]}`) {

  const fullName = process.argv[2];
  if (!fullName) {
    process.stderr.write('usage: node hash-minute.mjs <owner/repo>\n');
    process.exitCode = 2;
  } else {
    process.stdout.write(`${hashedMinute(fullName)}\n`);
  }
}
