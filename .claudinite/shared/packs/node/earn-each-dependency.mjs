import { finding } from '../../engine/checks/helpers/findings.mjs';

// Converted (the testable slice) from the engineering-practices skill's "Earn
// each dependency" rule. Only the *event* — a package.json gains a dependency it
// did not carry before — has a signature; the rule's judgment half (prefer a
// built-in or a few lines for a narrow job, and drop a dependency when the
// assumption that justified it lapses) stays in the skill, which this finding
// points back to. Directional by kind → advisory. Check-the-work: it reads the
// manifest at the scoping base, so it fires once, on the branch that adds the
// dependency, then converges (once the add is on main, base == head and the name
// is no longer new). A rename between dependency groups (e.g. dev → prod) and a
// version bump are not additions — the name already existed in the base.

const DEP_KEYS = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'];

// A package.json at the repo root or one directory down — the node pack's own
// marker scope, so a nested fixture/example manifest never counts.
const nearRoot = (f) => {
  const parts = f.split('/');
  return parts[parts.length - 1] === 'package.json' && parts.length <= 2;
};

function depNames(pkg) {
  const names = new Set();
  for (const key of DEP_KEYS) {
    for (const name of Object.keys(pkg?.[key] ?? {})) names.add(name);
  }
  return names;
}

const rule = {
  id: 'node/earn-each-dependency',
  severity: 'advisory',
  description: 'A newly added package.json dependency should be earned — prefer a built-in or a few lines for a narrow job',
  doc: 'skills/engineering-practices/SKILL.md',
  why: 'every dependency is standing surface area and supply-chain weight; a built-in or a few lines often covers a narrow job with none of it',

  run(ctx) {
    const out = [];
    for (const file of ctx.changedFiles.filter(nearRoot)) {
      const headText = ctx.read(file);
      if (headText === null) continue;
      let head;
      try { head = JSON.parse(headText); } catch { continue; } // malformed head is another check's problem
      const baseText = ctx.readBase(file);
      let base = {};
      if (baseText !== null) { try { base = JSON.parse(baseText); } catch { base = {}; } } // unparsable/absent base → nothing carried before
      const carried = depNames(base);
      for (const key of DEP_KEYS) {
        for (const name of Object.keys(head?.[key] ?? {})) {
          if (carried.has(name)) continue; // a move between groups or a version bump, not a new dependency
          out.push(finding(rule, {
            file,
            what: `"${name}" added to ${key}`,
            fix: 'confirm it earns its place — a built-in or a few lines often does a narrow job with no dependency; if it is warranted this advisory needs no change',
          }));
        }
      }
    }
    return out;
  },
};

export default rule;
