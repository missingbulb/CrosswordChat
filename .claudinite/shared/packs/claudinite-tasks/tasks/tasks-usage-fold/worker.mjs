// The tasks-usage-fold work step, and the whole task: no agent phase.
//
// It holds NO counting logic: the counting, the folding and the reads live in its
// siblings. This file is the I/O shell:
//
//   1. read the prior file from the BASE TIP — never the working tree, which may be
//      sitting on another task's branch;
//   2. list the scheduler's and the executor's completed runs past
//      `runsFoldedThrough`, and for each read its jobs (the billed minutes) and, for
//      a scheduler tick, its log (the cost record a tick has nowhere else to leave);
//   3. list the work items that CLOSED past `queueFoldedThrough` and read each one's
//      timeline — its outcome, the parks it collected, the four latencies its label
//      events answer, and the executor's cost record riding its comments;
//   4. fold: hour rows over the last three days, day rows over the last month, week
//      rows advanced past `foldedThrough`;
//   5. deliver the folded usage file, and
//      open NOTHING when the recompute is byte-identical apart from its stamp.
//
// THE API BUDGET, which is the reason the reads are shaped as they are. Per fold:
// two run listings, flat; one jobs listing per run this fold has not seen; at most
// four job-log reads (two scheduler ticks a day, at most two jobs each); one issues
// listing page; and one timeline read per item closing for the first time. On this
// repo's own cadence — two ticks a day, a quiet queue — the run half of that is
// under ten calls a day, which a test asserts by counting the fetches a
// representative day makes.
//
// The aggregate lives under `.claudinite/usage/`, beside the repo's other rolling
// records, where the vendoring refresh never reaches.

import { readFileSync } from 'node:fs';
import { baseTip, readAt, readRollingAt, remoteUrl } from '../../public/delivery.mjs';
import { AUTOMERGE_TRAILER } from '../../src/contract/merge-policy.mjs';
import {
  encodeTasksUsageFile, decodeTasksUsageFile, renderTasksUsageFile, withoutStamp, TASKS_USAGE_PATH, LEGACY_TASKS_USAGE_PATH,
} from '../../src/items/tasks-usage-format.mjs';
import { foldTasksUsage } from './fold-tasks-usage.mjs';
import { makeReader, readRunCosts } from './read-run-costs.mjs';
import { readClosedItems } from './read-items.mjs';
import { settingsPath } from '../../../../engine/settings-file.mjs';


const PR_BRANCH_PREFIX = 'claudinite/tasks-usage-fold';
const PACK_ID = 'claudinite-tasks';

// The run's own logger, under the task's name and its item. Module-level because the
// helpers below log too; `worker` takes the one the runner built.
let log = console.log;

// What a minute of Actions costs this repo, from the pack's own config. UNSET IS
// NOT ZERO: a public repo bills nothing and a private one bills something, and a
// fold that wrote `spend: 0` for the second would be stating a figure nobody gave
// it. Absent, no row in the file carries a spend at all and a reader says so.
export function minuteRateFrom(config, packId = PACK_ID) {
  const rate = config?.packConfig?.[packId]?.actionsMinuteRate;
  return typeof rate === 'number' && Number.isFinite(rate) && rate >= 0 ? rate : null;
}

export async function worker({ root, repo, token, defaultBranch, automerge, deliver, log: runLog }) {
  log = runLog;
  const base = defaultBranch ?? 'main';
  const remote = remoteUrl(repo, token);

  let config = {};
  try { config = JSON.parse(readFileSync(settingsPath(root), 'utf8')); } catch { /* no declaration */ }
  const minuteRate = minuteRateFrom(config);
  if (minuteRate === null) log('no `actionsMinuteRate` in this pack\'s config — the file records minutes and no spend');

  const baseSha = baseTip(root, remote, base);
  const rolling = readRollingAt(root, baseSha, TASKS_USAGE_PATH, LEGACY_TASKS_USAGE_PATH);
  let prior = {};
  try { prior = decodeTasksUsageFile(JSON.parse(rolling.text ?? '{}')); } catch { /* unparsable → refold */ }

  const now = new Date().toISOString();
  const reader = makeReader({ token });

  // Each source is INDEPENDENTLY fail-soft: one that cannot be read costs its own
  // rows this run and leaves its own watermark where it was, so the next fold
  // retries exactly what it missed.
  const runs = await readRunCosts({ reader, repo, since: prior.runsFoldedThrough ?? null, now });
  if (runs.error) log(`${runs.error} — the run and cost rows are unchanged this run`);
  if (runs.truncated) log('more runs are waiting than one fold reads — the watermark stops at the last one measured');

  const items = await readClosedItems({
    reader, repo, since: prior.queueFoldedThrough ?? null, now,
    schedulerRuns: runs.runs.filter((r) => r.workflow === 'scheduler'),
  });
  if (items.error) log(`${items.error} — the outcome, park and latency rows are unchanged this run`);

  const today = now.slice(0, 10);
  const text = renderTasksUsageFile(encodeTasksUsageFile(foldTasksUsage({
    prior,
    today,
    now,
    generated: now,
    minuteRate,
    runs: runs.runs,
    runsFoldedThrough: runs.watermark,
    items: items.records,
    queueFoldedThrough: items.watermark,
  })));

  // Compared WITHOUT the freshness stamp, which moves every run by construction: a
  // day on which nothing ran must still open nothing.
  const landed = readAt(root, baseSha, TASKS_USAGE_PATH);
  if (landed !== null && withoutStamp(landed) === withoutStamp(text)) {
    log(`${runs.runs.length} run(s) and ${items.records.length} closed item(s) folded — recompute is byte-identical, nothing to deliver`);
    return;
  }

  const pr = await deliver({
    stamp: today, branchPrefix: PR_BRANCH_PREFIX,
    files: { [TASKS_USAGE_PATH]: text },
    moves: rolling.moves,
    message: `Claudinite: fold tasks usage\n\n${AUTOMERGE_TRAILER}: ${automerge}`,
    title: 'Claudinite: tasks usage fold',
    body: [
      `Regenerated \`${TASKS_USAGE_PATH}\` from this repo's scheduler and executor run`,
      "listings, each run's jobs, the cost records those runs printed, and the work",
      'items that have closed since the last fold.',
      '',
      'Per day and per workflow: runs, jobs, billed minutes and — only where this',
      "pack's config carries `actionsMinuteRate` — the spend they imply. Per run: the",
      'API calls it made and its wall time per phase. Per task: what its occurrences',
      'came to, the parks they collected, and the four latency samples their label',
      'events answer.',
      '',
      'Every tier is appended once past its own watermark; a recompute that differs',
      'only in its `generated` stamp opens no pull request at all. Machine-written —',
      'never hand-edit it.',
    ].join('\n'),
  });
  log(`${runs.runs.length} run(s) and ${items.records.length} closed item(s) folded — `
    + `${pr.reused ? 'updated' : 'opened'} PR ${pr.number !== null ? `#${pr.number}` : `on ${pr.branch}`}`
    + `${pr.merged ? ' (landed)' : pr.delivery === 'review' ? ' (left for review)' : ''}`);
}
