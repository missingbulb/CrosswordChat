#!/usr/bin/env node
// SessionStart step: state, in one line, WHAT ACTUALLY LOADED this session —
// which repo, the active packs, the token weight of the prose injected, the guards
// and checks they arm, the skills mounted (the ones the hooks load on their own
// apart from the rest), plus whatever facet an active pack contributes about
// itself. Its stdout becomes session context, and it carries the directive that
// makes the session open with the line, so the person in front of it sees the
// load stated back rather than having to trust that it happened.
//
// WHY IT IS NOT THE ORCHESTRATOR'S FOOTER. That footer reports the MACHINERY:
// which steps ran and which crashed. This reports the VOLUME: how much guidance
// is in the window and how much of it is armed as checks. The two answer
// different questions and neither substitutes for the other — a session where
// every step ran and nothing was declared looks identical from the footer alone.
//
// RUNS LAST, after the steps whose work it counts (the skill mount), so it describes
// the session that exists rather than the one about to. The prose it weighs no longer
// arrives through this hook at all — it rides CLAUDE.md since #807 — but the weight is
// still this line's to state, because the cost lands in the same context window and a
// session that cannot see it has no way to notice the corpus growing.
//
// Core names no pack to get a pack-specific facet. A pack that has one states it
// on the FACET CHANNEL — a `CLAUDINITE-FACET:` line from its session-start step,
// collected by the step runner (engine/pack_loader/run-pack-session-start.mjs)
// into the file `CLAUDINITE_SESSION_FACETS` names — and this step appends what it
// finds there. The channel rides the step because the facts worth stating are the
// ones a pack had to COMPUTE: a static count is already in prose the reader has.
//
// Fails soft to silence, and exits 0 always — a non-zero exit makes Claude Code
// DISCARD the orchestrator's whole stdout, including the steps that did work.
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { settingsPath } from '../settings-file.mjs';

import { spawnSync } from 'node:child_process';

// The prose is reported in TOKENS because that is the unit of the cost it
// imposes — a context window, not a disk. The estimate goes through WORDS at the
// standard English ratio of roughly 0.75 words per token: prose is words, and a
// character count is thrown off by exactly what this corpus is full of — code
// fences, paths, punctuation-dense Markdown. Rounded to the hundred and shown in
// thousands (`14.3k`), because a session summary is a sense of scale, not an
// accounting.
const WORDS_PER_TOKEN = 0.75;
const TOKEN_ROUNDING = 100;
const plural = (n, one, many = `${one}s`) => `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;
const thousands = (n) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));

// Which repo this is, as `owner/repo`: the checkout's own origin remote, or the
// Actions environment naming it. Neither known is no facet — the line never guesses
// a name, and a directory name is not one.
function repoName(projectRoot) {
  const fromEnv = process.env.GITHUB_REPOSITORY;
  const git = spawnSync('git', ['remote', 'get-url', 'origin'], { cwd: projectRoot, encoding: 'utf8' });
  const url = git.status === 0 ? git.stdout.trim() : '';
  const m = /[:/]([^/:]+)\/([^/]+?)(?:\.git)?\/?$/.exec(url);
  if (m) return `${m[1]}/${m[2]}`;
  return typeof fromEnv === 'string' && fromEnv.includes('/') ? fromEnv : null;
}

try {
  const loaderDir = dirname(fileURLToPath(import.meta.url)); // <corpus>/engine/pack_loader
  const projectRoot = process.env.CLAUDE_PROJECT_DIR || process.cwd();

  let declared = [];
  const configPath = settingsPath(projectRoot);
  if (existsSync(configPath)) {
    const raw = JSON.parse(readFileSync(configPath, 'utf8'));
    if (Array.isArray(raw.packs)) declared = raw.packs;
  }

  const { loadPacks, isActive, bundledSkillSources } = await import(join(loaderDir, 'pack-registry.mjs'));
  const packs = await loadPacks({ localRoot: projectRoot });
  const active = packs.filter((pack) => isActive(pack, { packs: declared }));
  // Nothing active means this repo runs no Claudinite. Nothing loaded, so there
  // is nothing to state — the same silence the prose injector keeps.
  if (!active.length) process.exit(0);

  // The prose the injector actually emits: each active pack's own file, resolved
  // off the pack's directory, trimmed the way the injector trims it. The routing
  // table and the directory pointer are the injector's framing rather than a
  // pack's rules, so they are not counted here.
  const wordsByPack = new Map();
  for (const pack of active) {
    if (!pack.prose) continue;
    const prosePath = join(pack.dir, pack.prose);
    if (!existsSync(prosePath)) continue;
    try {
      const words = readFileSync(prosePath, 'utf8').trim().split(/\s+/).filter(Boolean).length;
      wordsByPack.set(pack.id, (wordsByPack.get(pack.id) ?? 0) + words);
    } catch { /* an unreadable file counts as none */ }
  }
  const proseWords = [...wordsByPack.values()].reduce((n, w) => n + w, 0);
  const estimate = (words, rounding) => Math.round(words / WORDS_PER_TOKEN / rounding) * rounding;
  const tokens = estimate(proseWords, TOKEN_ROUNDING);

  // What the active packs arm, split by WHEN it judges: a GUARD is a `scope: "action"`
  // declaration (`guardToolCalls`), judged per tool call by the PreToolUse hook; every
  // other rule — coded or declared, the pack's own or a skill's — is a CODE CHECK that
  // check_the_world and check_the_work between them run against this repo.
  let guards = 0;
  let checks = 0;
  for (const pack of active) {
    for (const rule of [...(pack.rules ?? []), ...(pack.skillChecks ?? [])]) {
      if (rule?.spec?.scope === 'action') guards += 1;
      else checks += 1;
    }
  }

  // The mounted skills, split by HOW they load: an AUTO-TRIGGER skill carries a
  // `force-load-on-*` trigger, so a hook loads it deterministically at the moment it
  // names; a REGULAR skill is offered on its description and loaded on judgment.
  const { skillMetadata } = await import(join(loaderDir, 'skill-frontmatter.mjs'));
  let autoTrigger = 0;
  let regular = 0;
  for (const dir of bundledSkillSources(active).values()) {
    const m = skillMetadata(dir);
    const triggers = m.forceLoadPaths.length + m.toolCallTriggers.length + m.promptTriggers.length + m.toolResultTriggers.length;
    if (triggers > 0) autoTrigger += 1;
    else regular += 1;
  }

  const facets = [
    plural(active.length, 'pack'),
    `${thousands(tokens)} context tokens`,
    plural(guards, 'guard'),
    plural(checks, 'code check'),
    plural(autoTrigger, 'auto-trigger skill'),
    plural(regular, 'regular skill'),
  ];

  // Whatever the active packs' steps said about themselves, in the order the
  // runner ran them. Absent file, unreadable file, no channel at all: the engine
  // facets stand on their own.
  const facetsFile = process.env.CLAUDINITE_SESSION_FACETS;
  if (facetsFile && existsSync(facetsFile)) {
    try {
      for (const line of readFileSync(facetsFile, 'utf8').split('\n')) {
        if (line.trim()) facets.push(line.trim());
      }
    } catch { /* one unreadable channel is not the session's problem */ }
  }

  // The directive comes FIRST and the line it names comes last, quoted by the colon:
  // a reader picking the nearest line then picks the summary. Said the other way round,
  // with the summary above and a "repeat that line" below it, the nearest line is the
  // directive itself — and sessions duly opened their replies by reciting it.
  const repo = repoName(projectRoot);
  process.stdout.write(
    'SESSION-START SUMMARY — an instruction to you, not text to repeat. '
    + 'Open your first reply of this session with exactly this line, and nothing before it:\n\n'
    + `Loaded Claudinite${repo ? ` from repo ${repo}` : ''}: ${facets.join(', ')}.\n`,
  );
} catch {
  // fail soft — a broken summary must never block a session
}
