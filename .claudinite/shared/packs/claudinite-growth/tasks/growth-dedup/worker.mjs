// The growth-dedup CODE-WORK: detect what the mounted canon changed in the window,
// and write the brief the agentic phase starts from.
//
// A run woken by canon movement used to be told only WHICH declared packs moved.
// A pack is a corpus, so that sent the run re-reading all of it for coverage that
// mostly predates the window, while the thing that can NEWLY cover a local item —
// what the canon ADDED in those days — was nowhere in the dispatch. Detecting it
// is deterministic code over the commit records, which is code-work's half of the
// task, not the agent's.
//
// Two kinds of addition, and the second is why a prose-only read is not enough: a
// canon **check** enforces its rule on every session and CI pass, which covers a
// local item more strongly than a stated line does, and it is invisible in the
// prose corpus. The brief carries both.
//
// The channel is the REPOSITORY, per the code-work contract:
// no code→agent data channel exists, so the brief is posted as a COMMENT on
// the run's own work item, whose number code-work is handed as CLAUDINITE_ITEM.
// The item is where the agentic phase is already reading, the brief describes THIS
// window and nothing else, and both die together when the item converges — which
// is the whole life the brief has. A standing issue would outlive it by a week and
// then hold a stale window.

import { git, github, packs } from '@claudinite/sdk';

const log = (s) => console.log(`growth-dedup code_work: ${s}`);

// The window this task's own cadence covers — `due:weekly` in task.json.
export const WINDOW_DAYS = 7;

// A canon pack's file, in the two-root form: the mount prefix is optional because
// the canon home runs this same code from its repo root, where the shared packs
// ARE `packs/`. A local pack (`.claudinite/local/packs/…`) matches neither root
// — deliberately: it is what this task prunes, never the yardstick it prunes
// against.
const CANON_PACK_FILE = /^(?:\.claudinite\/shared\/)?packs\/([^/]+)\/.+/;

// A rule id as a pack's declared-checks.json spells it — `id`, the key that file
// actually uses (`rule` is the settings vocabulary for overriding one, a
// different file). A drift guard in the pack's tests parses the real
// declared-checks.json through this, because keyed on the wrong word it silently
// returns nothing on every real patch while fixtures stay green.
const CHECK_ID = /"id"\s*:\s*"([^"]+)"/;

// How many added lines one file contributes to the brief. A heavy canon week can
// move a whole RULES.md rewrite; the remainder is COUNTED in its place, so a
// truncated brief never reads as the complete set of what the canon added.
export const MAX_ADDED_LINES_PER_FILE = 40;

// The whole brief's budget, against GitHub's 65536-byte cap on an issue comment. Measured
// need: the canon home's own busiest week rendered 350KB unbudgeted, so this is
// a live constraint, not a theoretical one. What the budget rations is the added
// LINES; every changed file is named regardless, since that list is cheap and is
// the run's map of where to look for what the budget left out.
export const MAX_BRIEF_BYTES = 60000;

/** The declared canon pack a repo path belongs to, or null. */
export function canonPackOf(path) {
  return CANON_PACK_FILE.exec(path)?.[1] ?? null;
}

/** The lines a unified-diff patch ADDED, marker stripped. */
export function addedLines(patch) {
  if (typeof patch !== 'string') return [];
  return patch.split('\n')
    .filter((l) => l.startsWith('+') && !l.startsWith('+++'))
    .map((l) => l.slice(1));
}

/** The check rule ids a declared-checks.json patch ADDED. */
export function addedCheckIds(patch) {
  return addedLines(patch).map((l) => CHECK_ID.exec(l)?.[1]).filter(Boolean);
}

/**
 * What the declared canon packs gained in the window. Pure over the commit
 * records (`{ sha, files: [{ filename, patch }] }`) the window's commits yield.
 *
 * ADDITIONS ONLY. A line the canon REMOVED can never justify a prune — coverage
 * the canon just dropped is coverage that is gone, and a local item carrying it
 * has become load-bearing rather than redundant — so a `-` line is not offered
 * here as something to prune against.
 */
export function summarizeCanonWindow(commits, declaredPacks) {
  const declared = new Set(declaredPacks ?? []);
  const packs = {};
  let addedLineCount = 0;
  let fileCount = 0;

  for (const c of commits ?? []) {
    for (const f of c.files ?? []) {
      const pack = canonPackOf(f.filename ?? '');
      if (!pack || !declared.has(pack)) continue;

      const entry = (packs[pack] ??= { files: {}, newCheckIds: [] });
      const file = entry.files[f.filename] ?? (fileCount += 1, entry.files[f.filename] = { added: [], patchUnavailable: false });

      // A binary diff carries no `patch`. Say so rather than record the
      // file as having added nothing — "the canon did not move here" is the one
      // claim this brief must never make falsely.
      if (typeof f.patch !== 'string') { file.patchUnavailable = true; continue; }

      const added = addedLines(f.patch);
      file.added.push(...added);
      addedLineCount += added.length;
      if (f.filename.endsWith('declared-checks.json')) {
        for (const id of addedCheckIds(f.patch)) if (!entry.newCheckIds.includes(id)) entry.newCheckIds.push(id);
      }
    }
  }
  return { packs, addedLineCount, fileCount };
}

/**
 * The brief: the window's canon additions, as the run's starting point.
 *
 * Two tiers, because they have different worth per byte. The MAP — each pack's
 * new check ids and the paths of every file that moved — is always complete: it
 * is what tells the run where to look, and it is cheap. The ADDITIONS are what
 * the budget rations, in map order, and what the budget leaves out is counted at
 * the end. A brief that quietly showed a prefix of the window would read as the
 * whole of it.
 */
export function renderBrief(summary, { sinceIso }) {
  const out = [];
  let spent = 0;
  const push = (...lines) => { out.push(...lines); spent += lines.join('\n').length + 1; };

  push(
    `# Canon window diff — since ${sinceIso}`,
    '',
    'Written by the `growth-dedup` code_work at the top of this run:',
    'this describes the CURRENT window only. It is where the run starts, not what it may cite —',
    'a prune may still quote an older line in one of these packs.',
    '',
  );
  const entries = Object.entries(summary.packs);
  if (!entries.length) {
    push('No declared canon pack moved in this window. Compare the local packs against the mounted canon as a whole.');
    return out.join('\n') + '\n';
  }

  // Tier 1 — the map.
  for (const [pack, { files, newCheckIds }] of entries) {
    push(`## ${pack}`, '');
    if (newCheckIds.length) {
      push(`**New checks** (a check covers a local item more strongly than prose): ${newCheckIds.map((id) => `\`${id}\``).join(', ')}`, '');
    }
    push('Files that moved:', '');
    for (const [path, file] of Object.entries(files)) {
      const note = file.patchUnavailable ? ' — no text patch (a binary diff); read the file whole'
        : file.added.length ? '' : ' — removals only, nothing added to prune against';
      push(`- \`${path}\`${note}`);
    }
    push('');
  }

  // Tier 2 — the additions, in map order, until the budget is spent.
  push('## What the canon added', '');
  let omitted = 0;
  for (const [, { files }] of entries) {
    for (const [path, file] of Object.entries(files)) {
      if (!file.added.length) continue;
      const shown = file.added.slice(0, MAX_ADDED_LINES_PER_FILE);
      const rest = file.added.length - shown.length;
      const block = [
        `### \`${path}\``, '', '```', ...shown, '```',
        ...(rest > 0 ? ['', `_…and ${rest} more added line${rest === 1 ? '' : 's'} in this file — read its diff for the rest._`] : []),
        '',
      ];
      if (spent + block.join('\n').length > MAX_BRIEF_BYTES) { omitted += 1; continue; }
      push(...block);
    }
  }
  if (omitted) {
    push(
      '---', '',
      `**This brief hit its size budget**: additions for ${omitted} further file${omitted === 1 ? '' : 's'} are not shown.`,
      'Every file that moved is named in the map above — read the diff of the omitted ones directly.', '',
    );
  }
  // The map tier is unbudgeted by design, so a window that moved thousands of
  // files could still overrun on the map alone. Cut it rather than let the issue
  // write 422 and fail the run on its first step — and say that it was cut.
  const body = out.join('\n') + '\n';
  if (body.length <= MAX_BRIEF_BYTES) return body;
  return `${body.slice(0, MAX_BRIEF_BYTES)}\n\n_**Truncated at ${MAX_BRIEF_BYTES} bytes** — this window moved more of the canon than one issue body holds._\n`;
}

/** The one line the work item shows for why the agent is here. */
export function handoffDetail(summary) {
  const packs = Object.keys(summary.packs);
  if (!packs.length) return 'no canon pack moved in the window — comparing against the mounted canon as a whole';
  const checks = packs.reduce((n, p) => n + summary.packs[p].newCheckIds.length, 0);
  return `${summary.addedLineCount} added line(s) across ${summary.fileCount} file(s) in ${packs.join(', ')}`
    + `, ${checks} new check${checks === 1 ? '' : 's'}`;
}

// --- the I/O shell -----------------------------------------------------------

/** A `git diff`'s files as the commit records carry them, `patch` absent for a binary. */
export function filesOfDiff(diff) {
  const out = [];
  for (const section of diff.split(/^(?=diff --git )/m)) {
    const header = /^diff --git a\/.+? b\/(.+)$/m.exec(section);
    if (!header) continue;
    const binary = /^Binary files .* differ$/m.test(section);
    out.push({ filename: header[1], ...(binary ? {} : { patch: section }) });
  }
  return out;
}

// Every window commit with the files it changed against its first parent. The
// run's checkout may be shallow, so the branch is fetched back to the window and
// one commit past it, the oldest window commit's parent; a commit whose parent is
// still out of reach is a thinner brief, never a failed run, and never its whole
// tree read as added.
async function windowCommits(branch, sinceIso) {
  const fetchBranch = (...args) => git('fetch', '--quiet', ...args, 'origin', branch);
  const failed = (r) => new Error(`could not fetch ${branch}: ${r.stderr.trim()}`);
  if ((await git('rev-parse', '--is-shallow-repository')).stdout.trim() === 'true') {
    const back = await fetchBranch(`--shallow-since=${sinceIso}`);
    // git refuses a shallow-since that selects nothing: the window holds no commit.
    if (back.code !== 0 && /no commits selected/.test(back.stderr)) return [];
    if (back.code !== 0) throw failed(back);
    const parent = await fetchBranch('--deepen=1');
    if (parent.code !== 0) throw failed(parent);
  } else {
    const plain = await fetchBranch();
    if (plain.code !== 0) throw failed(plain);
  }
  const listed = await git('log', `--since=${sinceIso}`, '--format=%H', 'FETCH_HEAD');
  if (listed.code !== 0) throw new Error(`commit listing unreadable: git log returned ${listed.code}: ${listed.stderr.trim()}`);
  const out = [];
  for (const sha of listed.stdout.split('\n').filter(Boolean)) {
    const diff = await git('-c', 'core.quotePath=false', 'diff', '--no-color', '--no-ext-diff', '--no-renames', `${sha}^1`, sha);
    if (diff.code !== 0) continue;
    out.push({ sha, files: filesOfDiff(diff.stdout) });
  }
  return out;
}

export async function worker({ defaultBranch, item: workItem, log }) {
  const branch = defaultBranch ?? 'main';

  const sinceIso = new Date(Date.now() - WINDOW_DAYS * 86400000).toISOString();
  // The repo's OWN declaration decides which packs are the yardstick: a canon
  // pack it does not declare contributes no prose, no checks and no coverage.
  // The engine's list holds local packs too, by bare id, and needs no filter,
  // since the mount roots `canonPackOf` matches exclude the local tree outright.
  const declared = (await packs()).map((p) => p.id);
  const summary = summarizeCanonWindow(await windowCommits(branch, sinceIso), declared);

  // The brief, onto the run's OWN work item. The queue hands every code-work run its
  // number; without it there is nowhere to put the brief and the agentic phase would
  // start from nothing, so this is a hard failure.
  const item = workItem.number;
  await github.createComment({ issue: item, body: renderBrief(summary, { sinceIso }) });
  const detail = handoffDetail(summary);
  log(`window brief posted to work item #${item} — ${detail}`);

  // ALWAYS hand off. The precondition already decided this run happens, and an
  // empty canon window still leaves the repo's fresh local items to re-check, so
  // there is no condition here to re-litigate — only work code-work cannot do:
  // judging whether an added canon line genuinely covers a local item.
  // No `delivered`: the brief is a comment on the item the agentic phase is already
  // reading, so there is no artifact identity this run has to hand over.
  return { requestAgent: { reason: { code: 'canon-window-diff', detail } } };
}
