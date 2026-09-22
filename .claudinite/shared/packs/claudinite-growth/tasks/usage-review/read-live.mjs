// The LIVE half of the review's inputs: what the tree says right now, which no
// window applies to. Three questions the record cannot answer -
//
//   what does each mounted skill declare about itself, and what does its body cost;
//   what does each active rule enforce, and does a RULES.md line say the same thing;
//   what has this repo accepted away or overridden.
//
// …plus the one date an `adoption` rule needs: when this repo declared the pack.
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const engine = (root, mod) => {
  const shared = join(root, '.claudinite', 'shared', 'engine', mod);
  return existsSync(shared) ? shared : join(root, 'engine', mod);
};

const read = (path) => { try { return readFileSync(path, 'utf8'); } catch { return ''; } };

// The tools a skill's result triggers name - the denominator
// `result-trigger-follows-every-call` is asked against. A trigger matching tools by
// regex names no one tool, so it contributes none and the rule reads *not recorded*
// rather than guessing which tool it meant.
export const toolsNamedBy = (triggers) => [...new Set((triggers ?? [])
  .map((t) => t.tool).filter((t) => typeof t === 'string'))];

// Every mounted skill as a review subject: what it declares, what its body costs,
// and which pack it came from.
export async function readSkills(root, packs) {
  const { skillMetadata } = await import(engine(root, 'pack_loader/skill-frontmatter.mjs'));
  const { estimateTokensOf } = await import(engine(root, 'pack_loader/token-estimate.mjs'));
  const out = [];
  for (const pack of packs) {
    for (const name of pack.skills ?? []) {
      const dir = join(pack.dir, 'skills', name);
      const meta = skillMetadata(dir);
      const body = read(join(dir, 'SKILL.md'));
      out.push({
        id: name,
        pack: pack.id,
        dir,
        // The body past its frontmatter - what a load actually costs the session.
        tokens: estimateTokensOf(body.replace(/^---[\s\S]*?\n---\n/, '')),
        expect: meta.usage?.expect ?? null,
        usageProblems: meta.usage?.problems ?? [],
        tools: toolsNamedBy(meta.toolResultTriggers),
        triggers: meta.forceLoadPaths.length + meta.toolCallTriggers.length
          + meta.promptTriggers.length + meta.toolResultTriggers.length,
      });
    }
  }
  return out;
}

// A rule id stated in the same pack's RULES.md, in backticks. That is the whole
// definition of a prose twin: a twin expressed any other way is not seen, and the
// review reports how many rules it judged twin-less so a reader can weigh what the
// definition missed rather than trust a number that hid it.
export function hasProseTwin(pack, ruleId) {
  const prose = read(join(pack.dir, pack.prose ?? 'RULES.md'));
  return prose.includes(`\`${ruleId}\``);
}

// The active rules, split into the two subject kinds the rules judge apart: a guard
// is a `scope: "action"` declaration, judged per tool call, and everything else is a
// check the sweeps run.
export function readRules(packs, packRules) {
  const byPack = new Map(packs.map((p) => [p.id, p]));
  const out = { check: [], guard: [] };
  for (const rule of packRules) {
    const pack = [...byPack.values()].find((p) => (p.rules ?? []).includes(rule)
      || (p.skillChecks ?? []).includes(rule));
    const subject = {
      id: rule.id,
      pack: pack?.id ?? null,
      severity: rule.severity ?? null,
      scope: rule.spec?.scope ?? rule.scope ?? null,
      ownerSkill: rule.ownerSkill ?? null,
      proseTwin: pack ? hasProseTwin(pack, rule.id) : false,
    };
    out[subject.scope === 'action' ? 'guard' : 'check'].push(subject);
  }
  return out;
}

// What this repo has accepted away or overridden for a rule: `accept` entries name
// the rule and the file, and a `rules` override to advisory is the same decision
// taken once for the whole tree, which is why the rule counts them together.
export function acceptanceReader(config) {
  const accepts = Array.isArray(config?.accept) ? config.accept : [];
  const overrides = config?.rules ?? {};
  return (ruleId) => {
    const reasons = accepts.filter((a) => a?.rule === ruleId);
    const overridden = overrides[ruleId] === 'advisory' ? 1 : 0;
    return reasons.length + overridden;
  };
}

// The reasons behind those acceptances, for the finding's evidence - listed
// together is what makes a structural exemption visible as one.
export const acceptanceReasons = (config, ruleId) => (Array.isArray(config?.accept) ? config.accept : [])
  .filter((a) => a?.rule === ruleId)
  .map((a) => ({ file: a.file ?? a.path ?? null, reason: a.reason ?? a.why ?? null }));

// When this repo first declared a pack - the adoption window's start. Read from the
// settings file's own history, deepened as far as the checkout reaches. A shallow
// clone that does not reach it answers null, and the `adoption` rules then read
// *not recorded* rather than judging against a date that is really the clone's.
export function packDeclaredAt(root, packId) {
  const run = (args) => execFileSync('git', args,
    { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  try {
    const first = run(['log', '--reverse', '--format=%H %aI',
      '-S', `"${packId}"`, '--', '.claudinite-settings.json']).trim().split('\n')[0];
    if (!first) return null;
    const [sha, at] = first.split(' ');
    // The earliest commit that MENTIONS the pack is the one that declared it only
    // if the commit before it did not already carry it. Without that second read
    // the search answers with the earliest commit the checkout happens to reach,
    // which on a shallow clone is the clone's own horizon - and the adoption
    // window then becomes a property of how deeply this checkout was fetched, so
    // one review over one record finds different things on two checkouts.
    let parent = null;
    try { parent = run(['rev-parse', '--verify', '-q', `${sha}^`]).trim(); } catch { parent = null; }
    if (!parent) {
      // No parent here: either the repository's own first commit, which is a real
      // answer, or a shallow boundary, where the declaration predates everything
      // we can see and its date is simply not knowable.
      return run(['rev-parse', '--is-shallow-repository']).trim() === 'true' ? null : at;
    }
    let before = '';
    try { before = run(['show', `${parent}:.claudinite-settings.json`]); } catch { before = ''; }
    return before.includes(`"${packId}"`) ? null : at;
  } catch { return null; }
}

export const ADOPTION_WEEKS = 4;

// Is the pack's adoption window still open, closed, or unknowable? A skill expecting
// `adoption` is judged only once the window has CLOSED - inside it, a skill that has
// not loaded yet may simply not have been reached.
export function adoptionWindow(declaredAt, now) {
  if (!declaredAt) return null;
  const from = new Date(declaredAt);
  const to = new Date(from);
  to.setUTCDate(to.getUTCDate() + ADOPTION_WEEKS * 7);
  return { from: from.toISOString(), to: to.toISOString(), closed: new Date(now) >= to };
}
